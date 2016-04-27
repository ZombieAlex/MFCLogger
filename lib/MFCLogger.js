"use strict";
var color = require("cli-color");
var MyFreeCams = require("MFCAuto");
var log = MyFreeCams.log;
var assert = require("assert");
var moment = require("moment");
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
})(LoggerCategories || (LoggerCategories = {}));
var Logger = (function () {
    function Logger(client, selectors, logmodelids, ready) {
        var _this = this;
        if (logmodelids === void 0) { logmodelids = false; }
        this.basicFormat = color.bgBlack.white;
        this.chatFormat = color.bgBlack.white;
        this.topicFormat = color.bgBlack.cyan;
        this.tinyTip = color.bgBlackBright.black;
        this.smallTip = color.bgWhite.black;
        this.mediumTip = color.bgWhiteBright.black;
        this.largeTip = color.bgYellowBright.black;
        this.rankUp = color.bgCyan.black;
        this.rankDown = color.bgRed.white;
        assert.ok(Array.isArray(selectors), "Selectors must be an array of LoggerSelectors");
        this.client = client;
        this.ready = ready;
        this.joinedRooms = new Set();
        this.previousStates = new Map();
        this.logSets = new Map();
        this.tempLogSets = new Map();
        this.userSessionsToIds = new Map();
        this.userIdsToNames = new Map();
        console.log(color.reset);
        if (logmodelids) {
            this.doMongo();
        }
        Object.getOwnPropertyNames(LoggerCategories).filter(function (v) { return isNaN(parseInt(v)); }).forEach(function (name) {
            _this.logSets.set(name, new Set());
            _this.tempLogSets.set(name, new Set());
        });
        selectors.forEach(function (selector) {
            selector.what.forEach(function (category) {
                if (LoggerCategories[category] === undefined) {
                    throw new Error("Invalid config option in 'what': " + category);
                }
                if (selector.id) {
                    if (selector.when) {
                        MyFreeCams.Model.getModel(selector.id).when(selector.when, function (m, p) {
                            _this.tempLogSets.get(LoggerCategories[category]).add(m.uid);
                            if (!_this.joinedRooms.has(m.uid) && _this.shouldJoinRoom(m)) {
                                _this.joinRoom(m);
                            }
                        }, function (m, p) {
                            _this.tempLogSets.get(LoggerCategories[category]).delete(m.uid);
                            if (_this.joinedRooms.has(m.uid) && !_this.shouldJoinRoom(m)) {
                                _this.leaveRoom(m);
                            }
                        });
                    }
                    else {
                        _this.logSets.get(LoggerCategories[category]).add(selector.id);
                    }
                }
                else {
                    assert.ok(selector.when, "Invalid configuration");
                    MyFreeCams.Model.when(selector.when, function (m, p) {
                        _this.tempLogSets.get(LoggerCategories[category]).add(m.uid);
                        if (!_this.joinedRooms.has(m.uid) && _this.shouldJoinRoom(m)) {
                            _this.joinRoom(m);
                        }
                    }, function (m, p) {
                        _this.tempLogSets.get(LoggerCategories[category]).delete(m.uid);
                        if (_this.joinedRooms.has(m.uid) && !_this.shouldJoinRoom(m)) {
                            _this.leaveRoom(m);
                        }
                    });
                }
            });
        });
        this.client.on("CMESG", this.chatLogger.bind(this));
        this.client.on("TOKENINC", this.tipLogger.bind(this));
        this.client.on("JOINCHAN", this.viewerLogger.bind(this));
        this.client.on("GUESTCOUNT", this.viewerLogger.bind(this));
        MyFreeCams.Model.on("rc", this.rcLogger.bind(this));
        MyFreeCams.Model.on("vs", this.stateLogger.bind(this));
        MyFreeCams.Model.on("truepvt", this.stateLogger.bind(this));
        MyFreeCams.Model.on("camscore", this.camscoreLogger.bind(this));
        MyFreeCams.Model.on("topic", this.topicLogger.bind(this));
        MyFreeCams.Model.on("rank", this.rankLogger.bind(this));
        if (this.ready !== undefined && logmodelids !== true) {
            this.ready(this);
        }
    }
    Logger.prototype.shouldJoinRoom = function (model) {
        var _this = this;
        var should = false;
        var joinRoomCategories = [LoggerCategories.all, LoggerCategories.nochat, LoggerCategories.chat, LoggerCategories.tips, LoggerCategories.viewers];
        joinRoomCategories.forEach(function (category) {
            if (_this.logSets.get(LoggerCategories[category]).has(model.uid) || _this.tempLogSets.get(LoggerCategories[category]).has(model.uid)) {
                should = true;
            }
        });
        return should;
    };
    Logger.prototype.inCategory = function (model, category) {
        return (this.logSets.get(LoggerCategories[category]).has(model.uid) || this.tempLogSets.get(LoggerCategories[category]).has(model.uid));
    };
    Logger.prototype.inCategories = function (model, categories) {
        var _this = this;
        var result = false;
        categories.forEach(function (category) {
            if (_this.inCategory(model, category)) {
                result = true;
            }
        });
        return result;
    };
    Logger.prototype.joinRoom = function (model) {
        if (!this.joinedRooms.has(model.uid)) {
            log("Joining room for " + model.nm, model.nm);
            this.client.joinRoom(model.uid);
            this.joinedRooms.add(model.uid);
        }
    };
    Logger.prototype.leaveRoom = function (model) {
        if (this.joinedRooms.has(model.uid)) {
            log("Leaving room for " + model.nm, model.nm);
            this.client.leaveRoom(model.uid);
            this.joinedRooms.delete(model.uid);
        }
    };
    Logger.prototype.chatLogger = function (packet) {
        if (this.inCategories(packet.aboutModel, [LoggerCategories.chat, LoggerCategories.all]) && packet.chatString !== undefined) {
            log(packet.chatString, packet.aboutModel.nm, this.chatFormat);
        }
    };
    Logger.prototype.tipLogger = function (packet) {
        if (this.inCategories(packet.aboutModel, [LoggerCategories.tips, LoggerCategories.all, LoggerCategories.nochat]) && packet.chatString !== undefined) {
            var msg = packet.sMessage;
            var format = this.tinyTip;
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
    };
    Logger.prototype.durationToString = function (duration) {
        function pad(num) {
            if (num < 10) {
                return "0" + num;
            }
            else {
                return "" + num;
            }
        }
        return pad(Math.floor(duration.asHours())) + ":" + pad(duration.minutes()) + ":" + pad(duration.seconds());
    };
    Logger.prototype.stateLogger = function (model, oldState, newState) {
        var now = moment();
        if (newState === MyFreeCams.FCVIDEO.OFFLINE) {
            this.joinedRooms.delete(model.uid);
        }
        else {
            if (this.shouldJoinRoom(model)) {
                this.joinRoom(model);
            }
        }
        if (this.inCategories(model, [LoggerCategories.state, LoggerCategories.all, LoggerCategories.nochat])) {
            var statestr = MyFreeCams.STATE[model.bestSession.vs];
            if (model.bestSession.truepvt === 1 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                statestr = "True Private";
            }
            if (model.bestSession.truepvt === 0 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                statestr = "Regular Private";
            }
            if (this.previousStates.has(model.uid)) {
                var lastState = this.previousStates.get(model.uid);
                var duration = moment.duration(now.valueOf() - lastState.lastStateMoment.valueOf());
                log(model.nm + " is now in state " + statestr + " after " + this.durationToString(duration) + " in " + lastState.lastStateStr, model.nm, this.basicFormat);
            }
            else {
                log(model.nm + " is now in state " + statestr, model.nm, this.basicFormat);
            }
            this.previousStates.set(model.uid, { lastStateStr: statestr, lastStateMoment: now, lastOnOffMoment: (oldState === MyFreeCams.FCVIDEO.OFFLINE || newState === MyFreeCams.FCVIDEO.OFFLINE) ? now : this.previousStates.get(model.uid).lastOnOffMoment });
        }
    };
    Logger.prototype.rankLogger = function (model, oldState, newState) {
        if (this.inCategories(model, [LoggerCategories.rank, LoggerCategories.all, LoggerCategories.nochat])) {
            if (oldState !== undefined) {
                var format = newState > oldState ? this.rankDown : this.rankUp;
                if (oldState === 0) {
                    oldState = "over 250";
                }
                if (newState === 0) {
                    newState = "over 250";
                }
                log(model.nm + " has moved from rank " + oldState + " to rank " + newState, model.nm, format);
                log(model.nm + " has moved from rank " + oldState + " to rank " + newState, "RANK_UPDATES", null);
            }
        }
    };
    Logger.prototype.topicLogger = function (model, oldState, newState) {
        if (this.inCategories(model, [LoggerCategories.topic, LoggerCategories.all, LoggerCategories.nochat])) {
            log("TOPIC: " + newState, model.nm, this.topicFormat);
        }
    };
    Logger.prototype.camscoreLogger = function (model, oldState, newState) {
        if (this.inCategories(model, [LoggerCategories.camscore, LoggerCategories.all, LoggerCategories.nochat])) {
            var format = newState > oldState ? this.rankUp : this.rankDown;
            log(model.nm + "'s camscore is now " + newState, model.nm, format);
        }
    };
    Logger.prototype.viewerLogger = function (packet) {
        if (this.inCategory(packet.aboutModel, LoggerCategories.viewers)) {
            if (packet.FCType === MyFreeCams.FCTYPE.GUESTCOUNT) {
                log("Guest viewer count is now " + packet.nArg1, packet.aboutModel.nm);
                return;
            }
            var msg = packet.sMessage;
            switch (packet.nArg2) {
                case MyFreeCams.FCCHAN.JOIN:
                    if (!this.userSessionsToIds.has(msg.sid) || this.userSessionsToIds.get(msg.sid) !== msg.uid) {
                        this.userSessionsToIds.set(msg.sid, msg.uid);
                    }
                    if (!this.userIdsToNames.has(msg.uid) || this.userIdsToNames.get(msg.uid) !== msg.nm) {
                        this.userIdsToNames.set(msg.uid, msg.nm);
                    }
                    log(msg.nm + " (id: " + packet.nFrom + ", level: " + MyFreeCams.FCLEVEL[msg.lv] + ") joined the room.", packet.aboutModel.nm);
                    break;
                case MyFreeCams.FCCHAN.PART:
                    if (this.userSessionsToIds.has(packet.nFrom)) {
                        var uid = this.userSessionsToIds.get(packet.nFrom);
                        log(this.userIdsToNames.get(uid) + " (id: " + uid + ") left the room.", packet.aboutModel.nm);
                    }
                    else {
                    }
                    break;
                default:
                    assert.fail("Don't know how to log viewer change for " + packet.toString());
            }
        }
    };
    Logger.prototype.rcLogger = function (model, before, after) {
        if (this.inCategory(model, LoggerCategories.viewers)) {
            log("Total viewer count is now " + after, model.nm);
        }
    };
    Logger.prototype.doMongo = function () {
        var _this = this;
        var mongodb = require("mongodb");
        var MongoClient = null;
        var database = null;
        var collection = null;
        MongoClient = mongodb.MongoClient;
        process.on('exit', function () {
            if (database !== null) {
                database.close();
            }
        });
        this.client.on("SESSIONSTATE", function (packet) {
            var id = packet.nArg2;
            var obj = packet.sMessage;
            if (obj !== undefined && obj.nm !== undefined) {
                collection.findOne({ id: id }, function (err, doc) {
                    if (err) {
                        throw err;
                    }
                    if (doc !== undefined) {
                        if (doc.names.indexOf(obj.nm) === -1) {
                            doc.names.push(obj.nm);
                            collection.save(doc, function (err, result) {
                                if (err) {
                                    log(err);
                                }
                            });
                        }
                    }
                    else {
                        collection.update({ id: id }, { id: id, names: [obj.nm] }, { w: 1, upsert: true }, function (err, result) {
                            if (err) {
                                log(err);
                            }
                        });
                    }
                });
            }
        });
        MongoClient.connect("mongodb://127.0.0.1:27017/Incoming", function (err, db) {
            if (err) {
                throw err;
            }
            database = db;
            db.collection("IDDB", function (err, col) {
                if (err) {
                    throw err;
                }
                if (col === undefined || col === null) {
                    throw new Error("Failed to connect to mongo");
                }
                collection = col;
                if (_this.ready !== undefined) {
                    _this.ready(_this);
                }
            });
        });
    };
    return Logger;
}());
exports.Logger = Logger;
exports.LoggerCategories = LoggerCategories;
//# sourceMappingURL=MFCLogger.js.map