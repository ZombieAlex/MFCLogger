var fs = require("fs");
var mongodb;
var color = require("cli-color");
var MyFreeCams = require("MFCAuto");
var log2 = MyFreeCams.log;
var assert = require("assert");
var moment = require("moment");
var Logger = (function () {
    function Logger(client, options, ready) {
        var _this = this;
        this.MongoClient = null;
        this.database = null;
        this.collection = null;
        this.basicFormat = color.bgBlack.white;
        this.chatFormat = color.bgBlack.white;
        this.topicFormat = color.bgBlack.cyan;
        this.tinyTip = color.bgBlackBright.black;
        this.smallTip = color.bgWhite.black;
        this.mediumTip = color.bgWhiteBright.black;
        this.largeTip = color.bgYellowBright.black;
        this.rankUp = color.bgCyan.black;
        this.rankDown = color.bgRed.white;
        this.client = client;
        this.options = options;
        this.ready = ready;
        console.log(color.reset);
        for (var k in options) {
            if (!options.hasOwnProperty(k)) {
                continue;
            }
            var v = options[k];
            switch (k) {
                case "logmodelids":
                    mongodb = require("mongodb");
                    this.MongoClient = mongodb.MongoClient;
                    process.on('exit', function () {
                        if (_this.database !== null) {
                            _this.database.close();
                        }
                    });
                    this.client.on("SESSIONSTATE", function (packet) {
                        var id = packet.nArg2;
                        var obj = packet.sMessage;
                        if (obj !== undefined && obj.nm !== undefined) {
                            _this.collection.findOne({ id: id }, function (err, doc) {
                                if (err) {
                                    throw err;
                                }
                                if (doc !== undefined) {
                                    if (doc.names.indexOf(obj.nm) === -1) {
                                        doc.names.push(obj.nm);
                                        _this.collection.save(doc, function (err, result) {
                                            if (err) {
                                                log2(err);
                                            }
                                        });
                                    }
                                }
                                else {
                                    _this.collection.update({ id: id }, { id: id, names: [obj.nm] }, { w: 1, upsert: true }, function (err, result) {
                                        if (err) {
                                            log2(err);
                                        }
                                    });
                                }
                            });
                        }
                    });
                    this.MongoClient.connect('mongodb://127.0.0.1:27017/Incoming', function (err, db) {
                        if (err) {
                            throw err;
                        }
                        _this.database = db;
                        db.collection('IDDB', function (err, col) {
                            if (err) {
                                throw err;
                            }
                            if (col === undefined || col === null) {
                                throw new Error("Failed to connect to mongo");
                            }
                            _this.collection = col;
                            if (ready !== undefined) {
                                _this.ready(_this);
                            }
                        });
                    });
                    break;
                case "all":
                    for (var model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logChatFor(v[model]);
                        this.logTipsFor(v[model]);
                        this.logStateFor(v[model]);
                        this.logCamScoreFor(v[model]);
                        this.logTopicsFor(v[model]);
                        this.logRankFor(v[model]);
                    }
                    break;
                case "nochat":
                    for (var model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logTipsFor(v[model]);
                        this.logStateFor(v[model]);
                        this.logCamScoreFor(v[model]);
                        this.logTopicsFor(v[model]);
                        this.logRankFor(v[model]);
                    }
                    break;
                case "chat":
                    for (var model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logChatFor(v[model]);
                        this.logTipsFor(v[model]);
                    }
                    break;
                case "tips":
                    for (var model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logTipsFor(v[model]);
                    }
                    break;
                case "viewers":
                    for (var model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logViewersFor(v[model]);
                    }
                    break;
                case "rank":
                    for (var model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logRankFor(v[model]);
                    }
                    break;
                case "topic":
                    for (var model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logTopicsFor(v[model]);
                    }
                    break;
                case "state":
                    for (var model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logStateFor(v[model]);
                    }
                    break;
                case "camscore":
                    for (var model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logCamScoreFor(v[model]);
                    }
                    break;
                default:
                    assert.fail("Unknown option '" + k + "'");
            }
        }
        ;
        this.client.on("CMESG", this.chatLogger.bind(this));
        this.client.on("TOKENINC", this.tipLogger.bind(this));
        this.client.on("JOINCHAN", this.viewerLogger.bind(this));
        this.client.on("GUESTCOUNT", this.viewerLogger.bind(this));
        MyFreeCams.Model.on("vs", this.stateLogger.bind(this));
        MyFreeCams.Model.on("truepvt", this.stateLogger.bind(this));
        MyFreeCams.Model.on("camscore", this.camscoreLogger.bind(this));
        MyFreeCams.Model.on("topic", this.topicLogger.bind(this));
        MyFreeCams.Model.on("rank", this.rankLogger.bind(this));
        if (this.ready !== undefined && options.logmodelids !== true) {
            this.ready(this);
        }
    }
    Logger.prototype.logChatFor = function (val) {
        var _this = this;
        switch (typeof val) {
            case "number":
                if (this.setState(val, "chat", true)) {
                    MyFreeCams.Model.getModel(val).on("vs", function (model, oldState, newState) {
                        if (newState !== MyFreeCams.STATE.Offline) {
                            _this.joinRoom(model);
                        }
                    });
                }
                break;
            case "object":
                for (var k in val) {
                    var v = val[k];
                    assert.strictEqual(typeof v, "function", "Don't know how to log chat for " + JSON.stringify(v));
                    MyFreeCams.Model.on(k, function (callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (this.setState(model.uid, "chat", true)) {
                                this.joinRoom(model);
                            }
                        }
                    }.bind(this, v));
                }
                break;
            default:
                assert.fail("Don't know how to log chat for " + JSON.stringify(val));
        }
        ;
    };
    Logger.prototype.logTipsFor = function (val) {
        var _this = this;
        switch (typeof val) {
            case "number":
                if (this.setState(val, "tips", true)) {
                    MyFreeCams.Model.getModel(val).on("vs", function (model, oldState, newState) {
                        if (newState !== MyFreeCams.STATE.Offline) {
                            _this.joinRoom(model);
                        }
                    });
                }
                break;
            case "object":
                for (var k in val) {
                    var v = val[k];
                    assert.strictEqual(typeof v, "function", "Don't know how to log tips for " + JSON.stringify(v));
                    MyFreeCams.Model.on(k, function (callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (this.setState(model.uid, "tips", true)) {
                                this.joinRoom(model);
                            }
                        }
                    }.bind(this, v));
                }
                break;
            default:
                assert.fail("Don't know how to log tips for " + JSON.stringify(val));
        }
    };
    Logger.prototype.logViewersFor = function (val) {
        var _this = this;
        switch (typeof val) {
            case "number":
                if (this.setState(val, "viewers", true)) {
                    MyFreeCams.Model.getModel(val).on("vs", function (model, oldState, newState) {
                        _this.stateLogger(model, oldState, newState);
                        if (newState !== MyFreeCams.STATE.Offline) {
                            _this.joinRoom(model);
                        }
                    });
                }
                break;
            case "object":
                for (var k in val) {
                    var v = val[k];
                    assert.strictEqual(typeof v, "function", "Don't know how to log viewers for " + JSON.stringify(v));
                    MyFreeCams.Model.on(k, function (callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (this.setState(model.uid, "viewers", true)) {
                                this.joinRoom(model);
                            }
                        }
                    }.bind(this, v));
                }
                break;
            default:
                assert.fail("Don't know how to log viewers for " + JSON.stringify(val));
        }
    };
    Logger.prototype.logStateFor = function (val) {
        this.logForHelper(val, "state");
        this.logForHelper(val, "truepvt");
    };
    Logger.prototype.logCamScoreFor = function (val) {
        this.logForHelper(val, "camscore");
    };
    Logger.prototype.logTopicsFor = function (val) {
        this.logForHelper(val, "topic");
    };
    Logger.prototype.logRankFor = function (val) {
        this.logForHelper(val, "rank");
    };
    Logger.prototype.logForHelper = function (val, prop) {
        switch (typeof val) {
            case "number":
                if (prop == "truepvt") {
                    prop = "state";
                }
                this.setState(val, prop, true);
            case "object":
                for (var k in val) {
                    var v = val[k];
                    assert.strictEqual(typeof v, "function", "Don't know how to log " + prop + " for " + JSON.stringify(v));
                    MyFreeCams.Model.on(k, function (callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (prop == "truepvt") {
                                prop = "state";
                            }
                            this.setState(model.uid, prop, true);
                        }
                    }.bind(this, v));
                }
                break;
            default:
                assert.fail("Don't know how to log " + prop + " for " + JSON.stringify(val));
        }
    };
    Logger.prototype.setState = function (id, state, value) {
        if (value === void 0) { value = true; }
        MyFreeCams.Model.getModel(id).logState = MyFreeCams.Model.getModel(id).logState || {};
        if (MyFreeCams.Model.getModel(id).logState[state] === value) {
            return false;
        }
        else {
            MyFreeCams.Model.getModel(id).logState[state] = value;
            return true;
        }
    };
    Logger.prototype.joinRoom = function (model) {
        if (model.__haveJoinedRoom === undefined || model.__haveJoinedRoom === false) {
            log2("Joining room for " + model.nm, model.nm);
            this.client.joinRoom(model.uid);
            model.__haveJoinedRoom = true;
        }
    };
    Logger.prototype.leaveRoom = function (model) {
        if (model.__haveJoinedRoom === true) {
            log2("Leaving room for " + model.nm, model.nm);
            this.client.leaveRoom(model.uid);
            model.__haveJoinedRoom = false;
        }
    };
    Logger.prototype.chatLogger = function (packet) {
        if (packet.aboutModel.logState !== undefined &&
            packet.aboutModel.logState.chat === true &&
            packet.chatString !== undefined) {
            log2(packet.chatString, packet.aboutModel.nm, this.chatFormat);
        }
    };
    Logger.prototype.tipLogger = function (packet) {
        if (packet.aboutModel.logState !== undefined &&
            packet.aboutModel.logState.tips === true &&
            packet.chatString !== undefined) {
            var format = this.tinyTip;
            if (packet.sMessage.tokens >= 50) {
                format = this.smallTip;
            }
            if (packet.sMessage.tokens >= 200) {
                format = this.mediumTip;
            }
            if (packet.sMessage.tokens >= 1000) {
                format = this.largeTip;
            }
            log2(packet.chatString, packet.aboutModel.nm, format);
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
            model.__haveJoinedRoom = false;
        }
        if (model.logState !== undefined && model.logState.state === true) {
            var statestr = MyFreeCams.STATE[model.bestSession.vs];
            if (model.bestSession.truepvt === 1 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                statestr = "True Private";
            }
            if (model.bestSession.truepvt === 0 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                statestr = "Regular Private";
            }
            if (model.logState.previousStateStr !== undefined && model.logState.lastStateChange !== undefined) {
                var duration = moment.duration(now - model.logState.lastStateChange);
                log2(model.nm + " is now in state " + statestr + " after " + this.durationToString(duration) + " in " + model.logState.previousStateStr, model.nm, this.basicFormat);
            }
            else {
                log2(model.nm + " is now in state " + statestr, model.nm, this.basicFormat);
            }
            model.logState.previousStateStr = statestr;
            model.logState.lastStateChange = now;
        }
    };
    Logger.prototype.rankLogger = function (model, oldState, newState) {
        if (model.logState !== undefined && model.logState.rank === true) {
            if (oldState != undefined) {
                var format = newState > oldState ? this.rankDown : this.rankUp;
                if (oldState === 0) {
                    oldState = "over 250";
                }
                if (newState === 0) {
                    newState = "over 250";
                }
                log2(model.nm + " has moved from rank " + oldState + " to rank " + newState, model.nm, format);
                log2(model.nm + " has moved from rank " + oldState + " to rank " + newState, "RANK_UPDATES", null);
            }
        }
    };
    Logger.prototype.topicLogger = function (model, oldState, newState) {
        if (model.logState !== undefined && model.logState.topic === true) {
            log2("TOPIC: " + newState, model.nm, this.topicFormat);
        }
    };
    Logger.prototype.camscoreLogger = function (model, oldState, newState) {
        if (model.logState !== undefined && model.logState.camscore === true) {
            var format = newState > oldState ? this.rankUp : this.rankDown;
            log2(model.nm + "'s camscore is now " + newState, model.nm, format);
        }
    };
    Logger.prototype.viewerLogger = function (packet) {
        if (packet.aboutModel.logState !== undefined &&
            packet.aboutModel.logState.viewers === true) {
            if (packet.FCType === MyFreeCams.FCTYPE.GUESTCOUNT) {
                log2("Guest viewer count is now " + packet.nArg1, packet.aboutModel.nm);
                return;
            }
            switch (packet.nArg2) {
                case MyFreeCams.FCCHAN.JOIN:
                    log2("User " + packet.sMessage.nm + " (id: " + packet.nFrom + ", level: " + packet.sMessage.lv + ") joined the room.", packet.aboutModel.nm);
                case MyFreeCams.FCCHAN.PART:
                default:
                    assert.fail("Don't know how to log viewer change for " + packet.toString());
            }
        }
    };
    return Logger;
}());
exports.Logger = Logger;
//# sourceMappingURL=MFCLogger.js.map