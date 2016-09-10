import * as sqlite3 from "sqlite3";
import * as assert from "assert";
import * as color from "cli-color";
import * as moment from "moment";
import * as MyFreeCams from "MFCAuto";
import * as fs from "fs";

let log = MyFreeCams.log;

enum LoggerCategories {
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

interface LoggerSelector {
    id?: number; // When not given, what applies to all models
    what: LoggerCategories[];
    when?: (m: MyFreeCams.Model) => boolean; // When not given, when is equivalent to (m) => true
}

class Logger {
    // Logging sets
    private logSets: Map<string, Set<number>>;
    private tempLogSets: Map<string, Set<number>>;
    private joinedRooms: Set<number>;
    private previousStates: Map<number, { lastStateStr: string, lastStateMoment: moment.Moment, lastOnOffMoment: moment.Moment }>;
    private userSessionsToIds: Map<number, number>;
    private userIdsToNames: Map<number, string>;

    // Set up basic modules and fields
    private client: MyFreeCams.Client;
    private ready: (l: Logger) => void;

    /////////////////////////////////////////
    // Color formatting
    private basicFormat = color.bgBlack.white;
    private chatFormat = color.bgBlack.white;
    private topicFormat = color.bgBlack.cyan;
    private tinyTip = color.bgBlackBright.black; // <50
    private smallTip = color.bgWhite.black; // <200
    private mediumTip = color.bgWhiteBright.black; // >200 and <1000
    private largeTip = color.bgYellowBright.black; // >1000
    private rankUp = color.bgCyan.black;
    private rankDown = color.bgRed.white;

    constructor(client: MyFreeCams.Client, selectors: LoggerSelector[], sqliteDBName: string = undefined, ready: (l: Logger) => void) {
        assert.ok(Array.isArray(selectors), "Selectors must be an array of LoggerSelectors");
        this.client = client;
        this.ready = ready;
        this.joinedRooms = new Set() as Set<number>;
        this.previousStates = new Map() as Map<number, { lastStateStr: string, lastStateMoment: moment.Moment, lastOnOffMoment: moment.Moment }>;
        this.logSets = new Map() as Map<string, Set<number>>;
        this.tempLogSets = new Map() as Map<string, Set<number>>;
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
            this.logSets.set(name, new Set() as Set<number>);
            this.tempLogSets.set(name, new Set() as Set<number>);
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
                        MyFreeCams.Model.getModel(selector.id).when(
                            selector.when,
                            (m: MyFreeCams.Model, p: MyFreeCams.Packet) => {
                                this.tempLogSets.get(LoggerCategories[category]).add(m.uid);
                                if (!this.joinedRooms.has(m.uid) && this.shouldJoinRoom(m)) {
                                    this.joinRoom(m);
                                }
                            },
                            (m: MyFreeCams.Model, p: MyFreeCams.Packet) => {
                                this.tempLogSets.get(LoggerCategories[category]).delete(m.uid);
                                if (this.joinedRooms.has(m.uid) && !this.shouldJoinRoom(m)) {
                                    this.leaveRoom(m);
                                }
                            }
                        );
                    } else {
                        // No when filter, always log this model
                        this.logSets.get(LoggerCategories[category]).add(selector.id);
                    }
                } else {
                    // No id, must be a global when filter
                    assert.ok(selector.when, "Invalid configuration, at least one of 'id' or 'when' must be on each selector");
                    MyFreeCams.Model.when(
                        selector.when,
                        (m: MyFreeCams.Model, p: MyFreeCams.Packet) => {
                            this.tempLogSets.get(LoggerCategories[category]).add(m.uid);
                            if (!this.joinedRooms.has(m.uid) && this.shouldJoinRoom(m)) {
                                this.joinRoom(m);
                            }
                        },
                        (m: MyFreeCams.Model, p: MyFreeCams.Packet) => {
                            this.tempLogSets.get(LoggerCategories[category]).delete(m.uid);
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
        MyFreeCams.Model.on("rc", this.rcLogger.bind(this));

        // Hook all state changes
        MyFreeCams.Model.on("vs", this.stateLogger.bind(this));
        // MyFreeCams.Model.on("truepvt", this.stateLogger.bind(this)); // This never fires due to an MFCAuto bug

        // Hook all camscore changes
        MyFreeCams.Model.on("camscore", this.camscoreLogger.bind(this));

        // Hook all topic changes
        MyFreeCams.Model.on("topic", this.topicLogger.bind(this));

        // Hook all rank changes
        MyFreeCams.Model.on("rank", this.rankLogger.bind(this));

        if (this.ready !== undefined && !sqliteDBName) {
            this.ready(this);
        }
    }

    // Returns true if we need to be in the given model's room to
    // log everything we've been asked to log.  False if not.
    private shouldJoinRoom(model: MyFreeCams.Model): boolean {
        let should = false;
        let joinRoomCategories = [LoggerCategories.all, LoggerCategories.nochat, LoggerCategories.chat, LoggerCategories.tips, LoggerCategories.viewers];
        joinRoomCategories.forEach((category) => {
            if (this.logSets.get(LoggerCategories[category]).has(model.uid) || this.tempLogSets.get(LoggerCategories[category]).has(model.uid)) {
                should = true;
            }
        });
        return should;
    }

    // Returns true if the given model falls within the given LoggerCategory
    // either temporarily or permanently. This is just a helper to make the
    // following code more readable.
    private inCategory(model: MyFreeCams.Model, category: LoggerCategories): boolean {
        return (this.logSets.get(LoggerCategories[category]).has(model.uid) || this.tempLogSets.get(LoggerCategories[category]).has(model.uid));
    }

    // Returns true if the given model is in any of the given categories
    private inCategories(model: MyFreeCams.Model, categories: LoggerCategories[]): boolean {
        let result = false;
        categories.forEach((category) => {
            if (this.inCategory(model, category)) {
                result = true;
            }
        });
        return result;
    }

    // Enters the given model's chat room if we're not already in it
    private joinRoom(model: MyFreeCams.Model) {
        if (!this.joinedRooms.has(model.uid)) {
            log(`Joining room for ${model.nm}`, model.nm);
            this.client.joinRoom(model.uid);
            this.joinedRooms.add(model.uid);
        }
    }

    // Leaves the given model's chat room, if we're in it
    private leaveRoom(model: MyFreeCams.Model) {
        if (this.joinedRooms.has(model.uid)) {
            log(`Leaving room for ${model.nm}`, model.nm);
            this.client.leaveRoom(model.uid);
            this.joinedRooms.delete(model.uid);
        }
    }
    private chatLogger(packet: MyFreeCams.Packet) {
        if (this.inCategories(packet.aboutModel, [LoggerCategories.chat, LoggerCategories.all]) && packet.chatString !== undefined) {
            log(packet.chatString, packet.aboutModel.nm, this.chatFormat);
        }
    }
    private tipLogger(packet: MyFreeCams.Packet) {
        if (this.inCategories(packet.aboutModel, [LoggerCategories.tips, LoggerCategories.all, LoggerCategories.nochat]) && packet.chatString !== undefined) {
            let msg = packet.sMessage as MyFreeCams.FCTokenIncResponse;
            let format = this.tinyTip;
            if (msg.tokens >= 50) {
                format = this.smallTip;
            }
            if (msg.tokens >= 200) {
                format = this.mediumTip;
            }
            if (msg.tokens >= 1000) {
                format = this.largeTip;
            }
            log(packet.chatString, packet.aboutModel.nm, format);
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
    private stateLogger(model: MyFreeCams.Model, oldState: MyFreeCams.FCVIDEO, newState: MyFreeCams.FCVIDEO) {
        let now = moment();

        // If a model has gone offline
        if (newState === MyFreeCams.FCVIDEO.OFFLINE) {
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

        if (this.inCategories(model, [LoggerCategories.state, LoggerCategories.all, LoggerCategories.nochat])) {
            let statestr = MyFreeCams.STATE[model.bestSession.vs];
            if (model.bestSession.truepvt === 1 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                statestr = "True Private";
            }
            if (model.bestSession.truepvt === 0 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                statestr = "Regular Private";
            }
            if (this.previousStates.has(model.uid)) {
                let lastState = this.previousStates.get(model.uid);
                let duration = moment.duration(now.valueOf() - lastState.lastStateMoment.valueOf());
                // let onOffDuration = moment.duration(now.valueOf() - lastState.lastStateMoment.valueOf()); @TODO - Do something with on/off durations ala JoinMFC
                log(`${model.nm} is now in state ${statestr} after ${this.durationToString(duration)} in ${lastState.lastStateStr}`, model.nm, this.basicFormat);
            } else {
                log(`${model.nm} is now in state ${statestr}`, model.nm, this.basicFormat);
            }
            this.previousStates.set(model.uid, { lastStateStr: statestr, lastStateMoment: now, lastOnOffMoment: (oldState === MyFreeCams.FCVIDEO.OFFLINE || newState === MyFreeCams.FCVIDEO.OFFLINE) ? now : this.previousStates.get(model.uid).lastOnOffMoment });
        }
    }
    private rankLogger(model: MyFreeCams.Model, oldState: number | string, newState: number | string) {
        if (this.inCategories(model, [LoggerCategories.rank, LoggerCategories.all, LoggerCategories.nochat])) {
            if (oldState !== undefined) { // Ignore the initial rank setting, just because it can be *very* noisy with thousands of girls online
                let format = newState > oldState ? this.rankDown : this.rankUp;
                if (oldState === 0) {
                    oldState = "over 250";
                    format = this.rankUp;
                }
                if (newState === 0) {
                    newState = "over 250";
                    format = this.rankDown;
                }

                log(`${model.nm} has moved from rank ${oldState} to rank ${newState}`, model.nm, format);
                log(`${model.nm} has moved from rank ${oldState} to rank ${newState}`, "RANK_UPDATES", null); // @BUGBUG - @TODO - Did I break this?  A null formatter was meant to indicate not to log anything to the console....
            }
        }
    }
    private topicLogger(model: MyFreeCams.Model, oldState: string, newState: string) {
        if (this.inCategories(model, [LoggerCategories.topic, LoggerCategories.all, LoggerCategories.nochat])) {
            log(`TOPIC: ${newState}`, model.nm, this.topicFormat);
        }
    }
    private camscoreLogger(model: MyFreeCams.Model, oldState: string, newState: string) {
        if (this.inCategories(model, [LoggerCategories.camscore, LoggerCategories.all, LoggerCategories.nochat])) {
            let format = newState > oldState || oldState === undefined ? this.rankUp : this.rankDown;
            log(`${model.nm}'s camscore is now ${newState}`, model.nm, format);
        }
    }
    private viewerLogger(packet: MyFreeCams.Packet) {
        if (this.inCategory(packet.aboutModel, LoggerCategories.viewers)) {
            if (packet.FCType === MyFreeCams.FCTYPE.GUESTCOUNT) {
                log(`Guest viewer count is now ${packet.nArg1}`, packet.aboutModel.nm);
                return;
            }

            // Otherwise this packet must be a JOINCHAN, a notification of a member (whether basic or premium) entering or leaving the room
            let msg = packet.sMessage as MyFreeCams.Message;
            switch (packet.nArg2) {
                case MyFreeCams.FCCHAN.JOIN:
                    // Add this session to our user mappings
                    if (!this.userSessionsToIds.has(msg.sid) || this.userSessionsToIds.get(msg.sid) !== msg.uid) {
                        this.userSessionsToIds.set(msg.sid, msg.uid);
                    }
                    // Add this user to our name mappings
                    if (!this.userIdsToNames.has(msg.uid) || this.userIdsToNames.get(msg.uid) !== msg.nm) {
                        this.userIdsToNames.set(msg.uid, msg.nm);
                    }
                    log(`${msg.nm} (id: ${packet.nFrom}, level: ${MyFreeCams.FCLEVEL[msg.lv]}) joined the room.`, packet.aboutModel.nm);
                    break;
                case MyFreeCams.FCCHAN.PART: // The user left the channel, for this we get no sMessage, but nFrom will be that user's session id (NOT their user id)
                    if (this.userSessionsToIds.has(packet.nFrom)) {
                        let uid = this.userSessionsToIds.get(packet.nFrom);
                        log(`${this.userIdsToNames.get(uid)} (id: ${uid}) left the room.`, packet.aboutModel.nm);
                    } else {
                        // This is very noisy and not so useful, so ignore users we don't know names for, for now
                        // log(`Unknown user with session id ${packet.nFrom} left the room.`, packet.aboutModel.nm);
                    }
                    break;
                default:
                    assert.fail(`Don't know how to log viewer change for ${packet.toString()}`);
            }
        }
    }
    private rcLogger(model: MyFreeCams.Model, before: number, after: number) {
        if (this.inCategory(model, LoggerCategories.viewers)) {
            log(`Total viewer count is now ${after}`, model.nm);
        }
    }

    // Ignore this, it's most likely not useful to you and not used by you...
    private doSqlite3(sqliteDBName: string) {
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
        this.client.on("SESSIONSTATE", (packet: MyFreeCams.Packet) => {
            let id = packet.nArg2;
            let obj = packet.sMessage as MyFreeCams.Message;
            if (obj !== undefined && obj.nm !== undefined) {
                database.get("SELECT modid, name, preferred FROM ids WHERE modid=? and name=?", [id, obj.nm], (err, row) => {
                    if (err) {
                        throw err;
                    }
                    if (row === undefined) { // We've not seen this name for this model before
                        database.get("SELECT modid, name, preferred FROM ids WHERE modid=? AND preferred=1", [id], (err2, row2) => {
                            if (err2) {
                                throw err2;
                            }

                            if (row2 === undefined) { // This model has no preferred name
                                database.run("INSERT INTO ids VALUES (?,?,?)", id, obj.nm, 1); // Set this name as preferred
                            } else {
                                database.run("INSERT INTO ids VALUES (?,?,?)", id, obj.nm, 0); // Record the name, leaving preferred alone
                            }
                        });
                    }
                });
            }
        });
    }
}

exports.Logger = Logger;
exports.LoggerCategories = LoggerCategories;
