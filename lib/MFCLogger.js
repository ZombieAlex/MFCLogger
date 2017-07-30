"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const moment = require("moment");
const mfc = require("MFCAuto");
const fs = require("fs");
const chalk = require("chalk");
var LoggerCategories;
(function (LoggerCategories) {
    LoggerCategories[LoggerCategories["all"] = 0] = "all";
    LoggerCategories[LoggerCategories["nochat"] = 1] = "nochat";
    LoggerCategories[LoggerCategories["chat"] = 2] = "chat";
    LoggerCategories[LoggerCategories["tips"] = 3] = "tips";
    LoggerCategories[LoggerCategories["viewers"] = 4] = "viewers";
    LoggerCategories[LoggerCategories["rank"] = 5] = "rank";
    LoggerCategories[LoggerCategories["topic"] = 6] = "topic";
    LoggerCategories[LoggerCategories["state"] = 7] = "state";
    LoggerCategories[LoggerCategories["camscore"] = 8] = "camscore";
})(LoggerCategories = exports.LoggerCategories || (exports.LoggerCategories = {}));
class Logger {
    constructor(client, selectors, sqliteDBName = undefined, ready) {
        this.joinRoomCategories = [LoggerCategories.all, LoggerCategories.nochat, LoggerCategories.chat, LoggerCategories.tips, LoggerCategories.viewers];
        this.basicFormat = chalk.bgBlack.white;
        this.chatFormat = chalk.bgBlack.white;
        this.topicFormat = chalk.bgBlack.cyan;
        this.rankUp = chalk.bgCyan.black;
        this.rankDown = chalk.bgRed.white;
        assert.ok(Array.isArray(selectors), "Selectors must be an array of LoggerSelectors");
        this.client = client;
        this.ready = ready;
        this.joinedRooms = new Set();
        this.previousStates = new Map();
        this.logSets = new Map();
        this.tempLogSets = new Map();
        this.userSessionsToIds = new Map();
        this.userIdsToNames = new Map();
        if (sqliteDBName) {
            this.doSqlite3(sqliteDBName);
        }
        Object.getOwnPropertyNames(LoggerCategories).filter(v => isNaN(parseInt(v))).forEach((name) => {
            this.logSets.set(name, new Map());
            this.tempLogSets.set(name, new Map());
        });
        selectors.forEach((selector) => {
            selector.what.forEach((category) => {
                if (LoggerCategories[category] === undefined) {
                    throw new Error(`Invalid config option in 'what': ${category}`);
                }
                if (selector.id) {
                    if (selector.when) {
                        mfc.Model.getModel(selector.id).when(selector.when, (m, p) => {
                            this.addTempLogging(category, m, selector.where);
                            if (!this.joinedRooms.has(m.uid) && this.shouldJoinRoom(m)) {
                                this.joinRoom(m);
                            }
                        }, (m, p) => {
                            this.removeTempLogging(category, m, selector.where);
                            if (this.joinedRooms.has(m.uid) && !this.shouldJoinRoom(m)) {
                                this.leaveRoom(m);
                            }
                        });
                    }
                    else {
                        this.addPermaLogging(category, mfc.Model.getModel(selector.id), selector.where);
                    }
                }
                else {
                    assert.ok(selector.when, "Invalid configuration, at least one of 'id' or 'when' must be on each selector");
                    mfc.Model.when(selector.when, (m, p) => {
                        this.addTempLogging(category, m, selector.where);
                        if (!this.joinedRooms.has(m.uid) && this.shouldJoinRoom(m)) {
                            this.joinRoom(m);
                        }
                    }, (m, p) => {
                        this.removeTempLogging(category, m, selector.where);
                        if (this.joinedRooms.has(m.uid) && !this.shouldJoinRoom(m)) {
                            this.leaveRoom(m);
                        }
                    });
                }
            });
        });
        this.client.on("CMESG", this.chatLogger.bind(this));
        this.client.on("TOKENINC", this.tipLogger.bind(this));
        this.client.on("JOINCHAN", this.viewerLogger.bind(this));
        this.client.on("GUESTCOUNT", this.viewerLogger.bind(this));
        mfc.Model.on("rc", this.rcLogger.bind(this));
        mfc.Model.on("vs", this.stateLogger.bind(this));
        mfc.Model.on("camscore", this.camscoreLogger.bind(this));
        mfc.Model.on("topic", this.topicLogger.bind(this));
        mfc.Model.on("rank", this.rankLogger.bind(this));
        if (this.ready !== undefined && !sqliteDBName) {
            this.ready(this);
        }
    }
    addTempLogging(category, m, filename) {
        if (!this.tempLogSets.get(LoggerCategories[category]).has(m.uid)) {
            this.tempLogSets.get(LoggerCategories[category]).set(m.uid, new Set());
        }
        if (filename !== null) {
            filename = filename || m.nm;
        }
        this.tempLogSets.get(LoggerCategories[category]).get(m.uid).add(filename);
    }
    removeTempLogging(category, m, filename) {
        this.tempLogSets.get(LoggerCategories[category]).get(m.uid).delete(filename);
        if (this.tempLogSets.get(LoggerCategories[category]).get(m.uid).size === 0) {
            this.tempLogSets.get(LoggerCategories[category]).delete(m.uid);
        }
    }
    addPermaLogging(category, m, filename) {
        if (!this.logSets.get(LoggerCategories[category]).has(m.uid)) {
            this.logSets.get(LoggerCategories[category]).set(m.uid, new Set());
        }
        if (filename !== null) {
            filename = filename || m.nm;
        }
        this.logSets.get(LoggerCategories[category]).get(m.uid).add(filename);
    }
    shouldJoinRoom(model) {
        let should = false;
        this.joinRoomCategories.forEach((category) => {
            if (this.logSets.get(LoggerCategories[category]).has(model.uid) || this.tempLogSets.get(LoggerCategories[category]).has(model.uid)) {
                should = true;
            }
        });
        return should;
    }
    inCategory(model, category) {
        return (this.logSets.get(LoggerCategories[category]).has(model.uid) || this.tempLogSets.get(LoggerCategories[category]).has(model.uid));
    }
    inCategories(model, categories) {
        let result = false;
        categories.forEach((category) => {
            if (this.inCategory(model, category)) {
                result = true;
            }
        });
        return result;
    }
    fileLogging(categories, uid, msg, format) {
        let alreadyLoggedToConsole = false;
        let alreadyLoggedFileSet = new Set();
        msg = `[${mfc.Model.getModel(uid).nm} (${uid})] ${msg}`;
        categories.forEach((category) => {
            let tempLogSets = this.tempLogSets.get(LoggerCategories[category]).has(uid) ? this.tempLogSets.get(LoggerCategories[category]).get(uid) : new Set();
            let permaLogSets = this.logSets.get(LoggerCategories[category]).has(uid) ? this.logSets.get(LoggerCategories[category]).get(uid) : new Set();
            let fullLogSet = new Set([...tempLogSets, ...permaLogSets]);
            fullLogSet.forEach((file) => {
                if (!alreadyLoggedFileSet.has(file)) {
                    if (!alreadyLoggedToConsole) {
                        if (format !== null) {
                            alreadyLoggedToConsole = true;
                        }
                        mfc.log(msg, file, format);
                    }
                    else {
                        let toStr = (n) => { return n < 10 ? "0" + n : "" + n; };
                        let d = new Date();
                        let taggedMsg = "[" + (toStr(d.getMonth() + 1)) + "/" + (toStr(d.getDate())) + "/" + (d.getFullYear()) + " - " + (toStr(d.getHours())) + ":" + (toStr(d.getMinutes())) + ":" + (toStr(d.getSeconds()));
                        if (file !== undefined) {
                            taggedMsg += (", " + file.toUpperCase() + "] " + msg);
                        }
                        else {
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
    joinRoom(model) {
        if (!this.joinedRooms.has(model.uid)) {
            this.fileLogging(this.joinRoomCategories, model.uid, `Joining room for ${model.nm}`);
            this.client.joinRoom(model.uid);
            this.joinedRooms.add(model.uid);
        }
    }
    leaveRoom(model) {
        if (this.joinedRooms.has(model.uid)) {
            this.fileLogging(this.joinRoomCategories, model.uid, `Leaving room for ${model.nm}`);
            this.client.leaveRoom(model.uid);
            this.joinedRooms.delete(model.uid);
        }
    }
    chatLogger(packet) {
        let categories = [LoggerCategories.chat, LoggerCategories.all];
        if (this.inCategories(packet.aboutModel, categories) && packet.chatString !== undefined) {
            this.fileLogging(categories, packet.aboutModel.uid, packet.chatString, this.chatFormat);
        }
    }
    tipLogger(packet) {
        let categories = [LoggerCategories.tips, LoggerCategories.all, LoggerCategories.nochat];
        if (this.inCategories(packet.aboutModel, categories) && packet.chatString !== undefined) {
            let msg = packet.sMessage;
            let minYellowIntensity = 0x20, maxYellowIntensity = 0xFF, maxIntensityTip = 1000;
            let tipSteps = maxIntensityTip / (maxYellowIntensity - minYellowIntensity);
            let tipIntensity = Math.min(minYellowIntensity + (Math.floor(msg.tokens / tipSteps)), maxYellowIntensity);
            this.fileLogging(categories, packet.aboutModel.uid, packet.chatString, chalk.black.bgRgb(tipIntensity, tipIntensity, 0));
        }
    }
    durationToString(duration) {
        function pad(num) {
            if (num < 10) {
                return "0" + num;
            }
            else {
                return "" + num;
            }
        }
        return `${pad(Math.floor(duration.asHours()))}:${pad(duration.minutes())}:${pad(duration.seconds())}`;
    }
    stateLogger(model, oldState, newState) {
        let now = moment();
        let categories = [LoggerCategories.state, LoggerCategories.all, LoggerCategories.nochat];
        if (newState === mfc.FCVIDEO.OFFLINE) {
            this.joinedRooms.delete(model.uid);
        }
        else {
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
                this.fileLogging(categories, model.uid, `${model.nm} is now in state ${statestr} after ${this.durationToString(duration)} in ${lastState.lastStateStr}`, this.basicFormat);
            }
            else {
                this.fileLogging(categories, model.uid, `${model.nm} is now in state ${statestr}`, this.basicFormat);
            }
            this.previousStates.set(model.uid, { lastStateStr: statestr, lastStateMoment: now, lastOnOffMoment: (oldState === mfc.FCVIDEO.OFFLINE || newState === mfc.FCVIDEO.OFFLINE || !this.previousStates.has(model.uid)) ? now : this.previousStates.get(model.uid).lastOnOffMoment });
        }
    }
    rankLogger(model, oldState, newState) {
        let categories = [LoggerCategories.rank, LoggerCategories.all, LoggerCategories.nochat];
        if (this.inCategories(model, categories)) {
            if (oldState !== undefined) {
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
    topicLogger(model, oldState, newState) {
        let categories = [LoggerCategories.topic, LoggerCategories.all, LoggerCategories.nochat];
        if (this.inCategories(model, categories)) {
            this.fileLogging(categories, model.uid, `TOPIC: ${newState}`, this.topicFormat);
        }
    }
    camscoreLogger(model, oldState, newState) {
        let categories = [LoggerCategories.camscore, LoggerCategories.all, LoggerCategories.nochat];
        if (this.inCategories(model, categories)) {
            let format = newState > oldState || oldState === undefined ? this.rankUp : this.rankDown;
            this.fileLogging(categories, model.uid, `${model.nm}'s camscore is now ${newState}`, format);
        }
    }
    viewerLogger(packet) {
        let categories = [LoggerCategories.viewers];
        if (this.inCategories(packet.aboutModel, categories)) {
            if (packet.FCType === mfc.FCTYPE.GUESTCOUNT) {
                this.fileLogging(categories, packet.aboutModel.uid, `Guest viewer count is now ${packet.nArg1}`);
                return;
            }
            let msg = packet.sMessage;
            switch (packet.nArg2) {
                case mfc.FCCHAN.JOIN:
                    if (!this.userSessionsToIds.has(msg.sid) || this.userSessionsToIds.get(msg.sid) !== msg.uid) {
                        this.userSessionsToIds.set(msg.sid, msg.uid);
                    }
                    if (!this.userIdsToNames.has(msg.uid) || this.userIdsToNames.get(msg.uid) !== msg.nm) {
                        this.userIdsToNames.set(msg.uid, msg.nm);
                    }
                    this.fileLogging(categories, packet.aboutModel.uid, `${msg.nm} (id: ${packet.nFrom}, level: ${mfc.FCLEVEL[msg.lv]}) joined the room.`);
                    break;
                case mfc.FCCHAN.PART:
                    if (this.userSessionsToIds.has(packet.nFrom)) {
                        let uid = this.userSessionsToIds.get(packet.nFrom);
                        this.fileLogging(categories, packet.aboutModel.uid, `${this.userIdsToNames.get(uid)} (id: ${uid}) left the room.`);
                    }
                    else {
                    }
                    break;
                default:
                    assert.ok(false, `Don't know how to log viewer change for ${packet.toString()}`);
            }
        }
    }
    rcLogger(model, before, after) {
        let categories = [LoggerCategories.viewers];
        if (this.inCategories(model, categories)) {
            this.fileLogging(categories, model.uid, `Total viewer count is now ${after}`);
        }
    }
    doSqlite3(sqliteDBName) {
        let sqlite3 = require("sqlite3");
        let createSchema = false;
        if (!fs.existsSync(sqliteDBName)) {
            createSchema = true;
        }
        let database = new sqlite3.Database(sqliteDBName || ":memory:");
        if (createSchema) {
            database.run("CREATE TABLE ids (modid INTEGER, name TEXT, preferred INTEGER)");
        }
        process.on('exit', () => {
            if (database !== null) {
                database.close();
            }
        });
        this.client.on("SESSIONSTATE", (packet) => {
            let id = packet.nArg2;
            let obj = packet.sMessage;
            if (obj !== undefined && obj.nm !== undefined) {
                database.get("SELECT modid, name, preferred FROM ids WHERE modid=? and name=?", [id, obj.nm], (err, row) => {
                    if (err) {
                        throw err;
                    }
                    if (row === undefined) {
                        database.get("SELECT modid, name, preferred FROM ids WHERE modid=? AND preferred=1", [id], (err2, row2) => {
                            if (err2) {
                                throw err2;
                            }
                            if (row2 === undefined) {
                                database.run("INSERT INTO ids VALUES (?,?,?)", id, obj.nm, 1);
                            }
                            else {
                                if (row2.name !== obj.nm) {
                                    database.run("INSERT INTO ids VALUES (?,?,?)", id, obj.nm, 0);
                                }
                            }
                        });
                    }
                });
            }
        });
    }
}
exports.Logger = Logger;
//# sourceMappingURL=MFCLogger.js.map