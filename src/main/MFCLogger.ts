import * as assert from "assert";
import * as supportsColor from "supports-color";
import * as moment from "moment";
import * as mfc from "MFCAuto";
import * as fs from "fs";
const chalk = require("chalk");

export enum LoggerCategories {
    // Log all of the below, except viewers, for these models
    all,
    // Log all of the below, except chat and viewers, for these models
    nochat,
    // Log chat and tips for these models
    chat,
    // Log tips but not chat for these models
    tips,
    // Log guest counts and member names of people entering/leaving
    // the chat room
    viewers,
    // Log rank changes for these models
    rank,
    // Log topic changes for these models
    topic,
    // Log video state changes for these models
    state,
    // Log camscore changes for these models
    camscore
}

export interface LoggerSelector {
    id?: number; // When not given, what applies to all models
    what: LoggerCategories[];
    when?: (m: mfc.Model) => boolean; // When not given, when is equivalent to (m) => true
    where?: string; // What log file to log into, if not specified, a log file matching the model's current name will be used
}

export class Logger {
    // Logging sets
    private logSets: Map<string, Map<number, Set<string>>>;
    private tempLogSets: Map<string, Map<number, Set<string>>>;
    private joinedRooms: Set<number>;
    private previousStates: Map<number, { lastStateStr: string, lastStateMoment: moment.Moment, lastOnOffMoment: moment.Moment }>;
    private userSessionsToIds: Map<number, number>;
    private userIdsToNames: Map<number, string>;
    private joinRoomCategories = [LoggerCategories.all, LoggerCategories.nochat, LoggerCategories.chat, LoggerCategories.tips, LoggerCategories.viewers];

    // Set up basic modules and fields
    private client: mfc.Client;
    private ready: (l: Logger) => void;

    /////////////////////////////////////////
    // Color formatting
    private basicFormat = chalk.bgBlack.white;
    private chatFormat = chalk.bgBlack.white;
    private topicFormat = chalk.bgBlack.cyan;
    private rankUp = chalk.bgCyan.black;
    private rankDown = chalk.bgRed.white;

    constructor(client: mfc.Client, selectors: LoggerSelector[], sqliteDBName: string = undefined, ready: (l: Logger) => void) {
        assert.ok(Array.isArray(selectors), "Selectors must be an array of LoggerSelectors");
        this.client = client;
        this.ready = ready;
        this.joinedRooms = new Set() as Set<number>;
        this.previousStates = new Map() as Map<number, { lastStateStr: string, lastStateMoment: moment.Moment, lastOnOffMoment: moment.Moment }>;
        this.logSets = new Map() as Map<string, Map<number, Set<string>>>;
        this.tempLogSets = new Map() as Map<string, Map<number, Set<string>>>;
        this.userSessionsToIds = new Map() as Map<number, number>;
        this.userIdsToNames = new Map() as Map<number, string>;

        /////////////////////////////////////
        // Color formatting
        // console.log(color.reset);

        /////////////////////////////////////
        // Process options

        // For internal use only, stores a mapping of
        // model ids to model names in a local sqlite3.
        // If that's useful to you and you have a local sqlite3,
        // go for it, otherwise it's just for me (the author)
        if (sqliteDBName) {
            this.doSqlite3(sqliteDBName);
        }

        // Init the empty model sets for each category
        Object.getOwnPropertyNames(LoggerCategories).filter(v => isNaN(parseInt(v))).forEach((name) => {
            this.logSets.set(name, new Map() as Map<number, Set<string>>);
            this.tempLogSets.set(name, new Map() as Map<number, Set<string>>);
        });

        selectors.forEach((selector) => {
            // Validate the selector array...
            selector.what.forEach((category) => {
                if (LoggerCategories[category] === undefined) {
                    throw new Error(`Invalid config option in 'what': ${category}`);
                }

                if (selector.id) {
                    if (selector.when) {
                        // When filter exists, only log this model when...
                        mfc.Model.getModel(selector.id).when(
                            selector.when,
                            (m: mfc.Model, p: mfc.Message) => {
                                this.addTempLogging(category, m, selector.where);
                                if (!this.joinedRooms.has(m.uid) && this.shouldJoinRoom(m)) {
                                    this.joinRoom(m);
                                }
                            },
                            (m: mfc.Model, p: mfc.Message) => {
                                this.removeTempLogging(category, m, selector.where);
                                if (this.joinedRooms.has(m.uid) && !this.shouldJoinRoom(m)) {
                                    this.leaveRoom(m);
                                }
                            }
                        );
                    } else {
                        // No when filter, always log this model
                        this.addPermaLogging(category, mfc.Model.getModel(selector.id), selector.where);
                    }
                } else {
                    // No id, must be a global when filter
                    assert.ok(selector.when, "Invalid configuration, at least one of 'id' or 'when' must be on each selector");
                    mfc.Model.when(
                        selector.when,
                        (m: mfc.Model, p: mfc.Message) => {
                            this.addTempLogging(category, m, selector.where);
                            if (!this.joinedRooms.has(m.uid) && this.shouldJoinRoom(m)) {
                                this.joinRoom(m);
                            }
                        },
                        (m: mfc.Model, p: mfc.Message) => {
                            this.removeTempLogging(category, m, selector.where);
                            if (this.joinedRooms.has(m.uid) && !this.shouldJoinRoom(m)) {
                                this.leaveRoom(m);
                            }
                        }
                    );
                }
            });
        });

        // Finally set up the callbacks for tip and chat messages

        // Hook all chat, filtering to the desired chat in the chatLogger function
        this.client.on("CMESG", this.chatLogger.bind(this));

        // Hook all tips
        this.client.on("TOKENINC", this.tipLogger.bind(this));

        // Hook all room viewer join/leaves
        this.client.on("JOINCHAN", this.viewerLogger.bind(this));
        this.client.on("GUESTCOUNT", this.viewerLogger.bind(this));
        mfc.Model.on("rc", this.rcLogger.bind(this));

        // Hook all state changes
        mfc.Model.on("vs", this.stateLogger.bind(this));
        // MyFreeCams.Model.on("truepvt", this.stateLogger.bind(this)); // This never fires due to an MFCAuto bug

        // Hook all camscore changes
        mfc.Model.on("camscore", this.camscoreLogger.bind(this));

        // Hook all topic changes
        mfc.Model.on("topic", this.topicLogger.bind(this));

        // Hook all rank changes
        mfc.Model.on("rank", this.rankLogger.bind(this));

        if (this.ready !== undefined && !sqliteDBName) {
            this.ready(this);
        }
    }

    private addTempLogging(category: LoggerCategories, m: mfc.Model, filename: string): void {
        if (!this.tempLogSets.get(LoggerCategories[category]).has(m.uid)) {
            this.tempLogSets.get(LoggerCategories[category]).set(m.uid, new Set());
        }
        if (filename !== null) {
            filename = filename || m.nm;
        }
        this.tempLogSets.get(LoggerCategories[category]).get(m.uid).add(filename);
    }

    private removeTempLogging(category: LoggerCategories, m: mfc.Model, filename: string): void {
        this.tempLogSets.get(LoggerCategories[category]).get(m.uid).delete(filename);
        if (this.tempLogSets.get(LoggerCategories[category]).get(m.uid).size === 0) {
            this.tempLogSets.get(LoggerCategories[category]).delete(m.uid);
        }
    }

    private addPermaLogging(category: LoggerCategories, m: mfc.Model, filename: string): void {
        if (!this.logSets.get(LoggerCategories[category]).has(m.uid)) {
            this.logSets.get(LoggerCategories[category]).set(m.uid, new Set());
        }
        if (filename !== null) {
            filename = filename || m.nm;
        }
        this.logSets.get(LoggerCategories[category]).get(m.uid).add(filename);
    }

    // Returns true if we need to be in the given model's room to
    // log everything we've been asked to log.  False if not.
    private shouldJoinRoom(model: mfc.Model): boolean {
        let should = false;
        this.joinRoomCategories.forEach((category) => {
            if (this.logSets.get(LoggerCategories[category]).has(model.uid) || this.tempLogSets.get(LoggerCategories[category]).has(model.uid)) {
                should = true;
            }
        });
        return should;
    }

    // Returns true if the given model falls within the given LoggerCategory
    // either temporarily or permanently. This is just a helper to make the
    // following code more readable.
    private inCategory(model: mfc.Model, category: LoggerCategories): boolean {
        return (this.logSets.get(LoggerCategories[category]).has(model.uid) || this.tempLogSets.get(LoggerCategories[category]).has(model.uid));
    }

    // Returns true if the given model is in any of the given categories
    private inCategories(model: mfc.Model, categories: LoggerCategories[]): boolean {
        let result = false;
        categories.forEach((category) => {
            if (this.inCategory(model, category)) {
                result = true;
            }
        });
        return result;
    }

    private fileLogging(categories: LoggerCategories[], uid: number, msg: string, format?: (msg: string) => string): void {
        let alreadyLoggedToConsole = false;
        let alreadyLoggedFileSet = new Set() as Set<string>;
        msg = `[${mfc.Model.getModel(uid).nm} (${uid})] ${msg}`;
        categories.forEach((category) => {
            let tempLogSets = this.tempLogSets.get(LoggerCategories[category]).has(uid) ? this.tempLogSets.get(LoggerCategories[category]).get(uid) : new Set() as Set<string>;
            let permaLogSets = this.logSets.get(LoggerCategories[category]).has(uid) ? this.logSets.get(LoggerCategories[category]).get(uid) : new Set() as Set<string>;
            let fullLogSet = new Set([...tempLogSets, ...permaLogSets]);
            fullLogSet.forEach((file) => {
                if (!alreadyLoggedFileSet.has(file)) {
                    if (!alreadyLoggedToConsole) { // Only log each message to the console once
                        if (format !== null) {
                            alreadyLoggedToConsole = true;
                        }
                        mfc.log(msg, file, format);
                    } else {
                        // @TODO - This is the non-console part of MFCAuto.log, maybe I should expose
                        // something in MFCAuto to retrieve the tagged message rather than duplicating code here.
                        let toStr = (n: number): string => { return n < 10 ? "0" + n : "" + n; };
                        let d = new Date();
                        let taggedMsg = "[" + (toStr(d.getMonth() + 1)) + "/" + (toStr(d.getDate())) + "/" + (d.getFullYear()) + " - " + (toStr(d.getHours())) + ":" + (toStr(d.getMinutes())) + ":" + (toStr(d.getSeconds()))/* + "." + (d.getMilliseconds())*/;
                        if (file !== undefined) {
                            taggedMsg += (", " + file.toUpperCase() + "] " + msg);
                        } else {
                            taggedMsg += ("] " + msg);
                        }
                        let fd = fs.openSync(file + ".txt", "a");
                        fs.writeSync(fd, taggedMsg + "\r\n");
                        fs.closeSync(fd);
                    }
                    alreadyLoggedFileSet.add(file);
                }
            });
        });
    }

    // Enters the given model's chat room if we're not already in it
    private joinRoom(model: mfc.Model) {
        if (!this.joinedRooms.has(model.uid)) {
            this.fileLogging(this.joinRoomCategories, model.uid, `Joining room for ${model.nm}`);
            this.client.joinRoom(model.uid);
            this.joinedRooms.add(model.uid);
        }
    }

    // Leaves the given model's chat room, if we're in it
    private leaveRoom(model: mfc.Model) {
        if (this.joinedRooms.has(model.uid)) {
            this.fileLogging(this.joinRoomCategories, model.uid, `Leaving room for ${model.nm}`);
            this.client.leaveRoom(model.uid);
            this.joinedRooms.delete(model.uid);
        }
    }
    private chatLogger(packet: mfc.Packet) {
        let categories = [LoggerCategories.chat, LoggerCategories.all];
        if (this.inCategories(packet.aboutModel, categories) && packet.chatString !== undefined) {
            this.fileLogging(categories, packet.aboutModel.uid, packet.chatString, this.chatFormat);
        }
    }
    private tipLogger(packet: mfc.Packet) {
        let categories = [LoggerCategories.tips, LoggerCategories.all, LoggerCategories.nochat];
        if (this.inCategories(packet.aboutModel, categories) && packet.chatString !== undefined) {
            let msg = packet.sMessage as mfc.FCTokenIncResponse;

            // Calculate the yellow intensity of the current tip on a scale of 0x20 Red+Green to 0xFF Red+Green,
            // maxing out at 1000 tokens.
            let minYellowIntensity = 0x20, maxYellowIntensity = 0xFF, maxIntensityTip = 1000;
            let tipSteps = maxIntensityTip / (maxYellowIntensity - minYellowIntensity);
            let tipIntensity = Math.min(minYellowIntensity + (Math.floor(msg.tokens / tipSteps)), maxYellowIntensity);

            this.fileLogging(categories, packet.aboutModel.uid, packet.chatString, chalk.black.bgRgb(tipIntensity, tipIntensity, 0));
        }
    }
    private durationToString(duration: moment.Duration): string {
        // We could use moment.duration().humanize(), but that's a little too imprecise for my tastes
        // Instead, we'll break down to a string that captures the exact hours/minutes/seconds
        function pad(num: number) {
            if (num < 10) {
                return "0" + num;
            } else {
                return "" + num;
            }
        }
        return `${pad(Math.floor(duration.asHours()))}:${pad(duration.minutes())}:${pad(duration.seconds())}`;
    }
    private stateLogger(model: mfc.Model, oldState: mfc.FCVIDEO, newState: mfc.FCVIDEO) {
        let now = moment();
        let categories = [LoggerCategories.state, LoggerCategories.all, LoggerCategories.nochat];

        // If a model has gone offline
        if (newState === mfc.FCVIDEO.OFFLINE) {
            // Indicate that we are not in her room, so that
            // we'll issue another joinroom request when she logs back on
            // but don't actually leave her room (via leaveRoom())
            this.joinedRooms.delete(model.uid);
            // @TODO - @BUGBUG - Add a hook for when we lose the server connection to delete the entry as well
        } else {
            if (this.shouldJoinRoom(model)) {
                this.joinRoom(model);
            }
        }

        if (this.inCategories(model, categories)) {
            let statestr = mfc.STATE[model.bestSession.vs];
            if (model.bestSession.truepvt === 1 && model.bestSession.vs === mfc.STATE.Private) {
                statestr = "True Private";
            }
            if (model.bestSession.truepvt === 0 && model.bestSession.vs === mfc.STATE.Private) {
                statestr = "Regular Private";
            }
            if (this.previousStates.has(model.uid)) {
                let lastState = this.previousStates.get(model.uid);
                let duration = moment.duration(now.valueOf() - lastState.lastStateMoment.valueOf());
                // let onOffDuration = moment.duration(now.valueOf() - lastState.lastStateMoment.valueOf()); @TODO - Do something with on/off durations ala JoinMFC
                this.fileLogging(categories, model.uid, `${model.nm} is now in state ${statestr} after ${this.durationToString(duration)} in ${lastState.lastStateStr}`, this.basicFormat);
            } else {
                this.fileLogging(categories, model.uid, `${model.nm} is now in state ${statestr}`, this.basicFormat);
            }
            this.previousStates.set(model.uid, { lastStateStr: statestr, lastStateMoment: now, lastOnOffMoment: (oldState === mfc.FCVIDEO.OFFLINE || newState === mfc.FCVIDEO.OFFLINE || !this.previousStates.has(model.uid)) ? now : this.previousStates.get(model.uid).lastOnOffMoment });
        }
    }
    private rankLogger(model: mfc.Model, oldState: number | string, newState: number | string) {
        let categories = [LoggerCategories.rank, LoggerCategories.all, LoggerCategories.nochat];
        if (this.inCategories(model, categories)) {
            if (oldState !== undefined) { // Ignore the initial rank setting, just because it can be *very* noisy with thousands of girls online
                let format = newState > oldState ? this.rankDown : this.rankUp;
                if (oldState === 0) {
                    oldState = "over 1000";
                    format = this.rankUp;
                }
                if (newState === 0) {
                    newState = "over 1000";
                    format = this.rankDown;
                }

                this.fileLogging(categories, model.uid, `${model.nm} has moved from rank ${oldState} to rank ${newState}`, format);
            }
        }
    }
    private topicLogger(model: mfc.Model, oldState: string, newState: string) {
        let categories = [LoggerCategories.topic, LoggerCategories.all, LoggerCategories.nochat];
        if (this.inCategories(model, categories)) {
            this.fileLogging(categories, model.uid, `TOPIC: ${newState}`, this.topicFormat);
        }
    }
    private camscoreLogger(model: mfc.Model, oldState: string, newState: string) {
        let categories = [LoggerCategories.camscore, LoggerCategories.all, LoggerCategories.nochat]
        if (this.inCategories(model, categories)) {
            let format = newState > oldState || oldState === undefined ? this.rankUp : this.rankDown;
            this.fileLogging(categories, model.uid, `${model.nm}'s camscore is now ${newState}`, format);
        }
    }
    private viewerLogger(packet: mfc.Packet) {
        let categories = [LoggerCategories.viewers];
        if (this.inCategories(packet.aboutModel, categories)) {
            if (packet.FCType === mfc.FCTYPE.GUESTCOUNT) {
                this.fileLogging(categories, packet.aboutModel.uid, `Guest viewer count is now ${packet.nArg1}`);
                return;
            }

            // Otherwise this packet must be a JOINCHAN, a notification of a member (whether basic or premium) entering or leaving the room
            let msg = packet.sMessage as mfc.Message;
            switch (packet.nArg2) {
                case mfc.FCCHAN.JOIN:
                    // Add this session to our user mappings
                    if (!this.userSessionsToIds.has(msg.sid) || this.userSessionsToIds.get(msg.sid) !== msg.uid) {
                        this.userSessionsToIds.set(msg.sid, msg.uid);
                    }
                    // Add this user to our name mappings
                    if (!this.userIdsToNames.has(msg.uid) || this.userIdsToNames.get(msg.uid) !== msg.nm) {
                        this.userIdsToNames.set(msg.uid, msg.nm);
                    }
                    this.fileLogging(categories, packet.aboutModel.uid, `${msg.nm} (id: ${msg.uid}, level: ${mfc.FCLEVEL[msg.lv]}) joined the room.`);
                    break;
                case mfc.FCCHAN.PART: // The user left the channel, for this we get no sMessage, but nFrom will be that user's session id (NOT their user id)
                    if (this.userSessionsToIds.has(packet.nFrom)) {
                        let uid = this.userSessionsToIds.get(packet.nFrom);
                        this.fileLogging(categories, packet.aboutModel.uid, `${this.userIdsToNames.get(uid)} (id: ${uid}) left the room.`);
                    } else {
                        // This is very noisy and not so useful, so ignore users we don't know names for, for now
                        // this.fileLogging(packet.aboutModel.uid, `Unknown user with session id ${packet.nFrom} left the room.`);
                    }
                    break;
                default:
                    assert.ok(false, `Don't know how to log viewer change for ${packet.toString()}`);
            }
        }
    }
    private rcLogger(model: mfc.Model, before: number, after: number) {
        let categories = [LoggerCategories.viewers];
        if (this.inCategories(model, categories)) {
            this.fileLogging(categories, model.uid, `Total viewer count is now ${after}`);
        }
    }

    // Ignore this, it's most likely not useful to you and not used by you...
    private doSqlite3(sqliteDBName: string) {
        let sqlite3 = require("sqlite3");
        let createSchema = false;
        if (!fs.existsSync(sqliteDBName)) {
            createSchema = true;
        }
        let database = new sqlite3.Database(sqliteDBName || ":memory:");
        if (createSchema) {
            database.run("CREATE TABLE ids (modid INTEGER, name TEXT, preferred INTEGER)");
        }

        // Save the db before exiting
        process.on('exit', () => {
            if (database !== null) {
                database.close();
            }
        });

        // Set up a sessionstate callback, which will record all the model IDs
        this.client.on("SESSIONSTATE", (packet: mfc.Packet) => {
            let id = packet.nArg2;
            let obj = packet.sMessage as mfc.Message;
            if (obj !== undefined && obj.nm !== undefined) {
                database.get("SELECT modid, name, preferred FROM ids WHERE modid=? and name=?", [id, obj.nm], (err: Error, row: any) => {
                    if (err) {
                        throw err;
                    }
                    if (row === undefined) { // We've not seen this name for this model before
                        database.get("SELECT modid, name, preferred FROM ids WHERE modid=? AND preferred=1", [id], (err2: Error, row2: any) => {
                            if (err2) {
                                throw err2;
                            }

                            // Issue: Race conditions in these callbacks could theoretically result in duplicate rows
                            // Although I've never seen that happen in practice and it doesn't really matter downstream
                            if (row2 === undefined) { // This model has no preferred name
                                database.run("INSERT INTO ids VALUES (?,?,?)", id, obj.nm, 1); // Set this name as preferred
                            } else {
                                if (row2.name !== obj.nm) { // If the current name hasn't already become preferred from a race condition
                                    database.run("INSERT INTO ids VALUES (?,?,?)", id, obj.nm, 0); // Record the name, leaving preferred alone
                                }
                            }
                        });
                    }
                });
            }
        });
    }
}
