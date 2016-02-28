/// <reference path="../typings/node/node.d.ts" />
/// <reference path="../node_modules/MFCAuto/lib/MFCAuto.d.ts" />
/*
@TODO - switch to using nconf for the configuration?
*/
var fs = require("fs");
var mongodb = require("mongodb");
var color = require("cli-color");
var MyFreeCams = require("MFCAuto");
var log2 = MyFreeCams.log;
var assert2 = require("assert");
var Logger = (function () {
    function Logger(options, ready) {
        var _this = this;
        /////////////////////////////////////////
        //MongoDB support for recording model IDs
        this.MongoClient = mongodb.MongoClient;
        this.database = null;
        this.collection = null;
        /////////////////////////////////////////
        //Color formatting
        this.basicFormat = color.bgBlack.white;
        this.chatFormat = color.bgBlack.white;
        this.topicFormat = color.bgBlack.cyan;
        this.tinyTip = color.bgBlackBright.black; // <50
        this.smallTip = color.bgWhite.black; // <200, not actually yellow, more of a bold white, but still...
        this.mediumTip = color.bgWhiteBright.black; // >200 and <1000
        this.largeTip = color.bgYellowBright.black; // >1000
        this.rankUp = color.bgCyan.black;
        this.rankDown = color.bgRed.white;
        this.client = new MyFreeCams.Client();
        this.options = options;
        this.ready = ready;
        /////////////////////////////////////
        //Color formatting
        console.log(color.reset);
        /////////////////////////////////////
        //Parse options
        for (var k in options) {
            if (!options.hasOwnProperty(k)) {
                continue;
            }
            var v = options[k];
            switch (k) {
                case "logmodelids":
                    // Mongo shape is {_id: mongoshit, id: <mfcid number>, names: [name1, name2, etc]}
                    //Save the db before exiting
                    process.on('exit', function () {
                        if (_this.database !== null) {
                            _this.database.close();
                        }
                    });
                    //Set up a sessionstate callback, which will record all the model IDs
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
                                                log2(err); //throw err
                                            }
                                        });
                                    }
                                }
                                else {
                                    _this.collection.update({ id: id }, { id: id, names: [obj.nm] }, { w: 1, upsert: true }, function (err, result) {
                                        if (err) {
                                            log2(err); //throw err
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
                        this.logTipsFor(v[model]); //Can't imagine wanting to log chat and not tips...
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
                        this.logTipsFor(v[model]);
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
                    assert2.fail("Unknown option '" + k + "'");
            }
        }
        ;
        //Finally set up the callbacks for tip and chat messages
        //Hook all chat, filtering to the desired chat in the chatLogger function
        this.client.on("CMESG", this.chatLogger.bind(this));
        //Hook all tips
        this.client.on("TOKENINC", this.tipLogger.bind(this));
        //Hook all room viewer join/leaves
        this.client.on("JOINCHAN", this.viewerLogger.bind(this));
        this.client.on("GUESTCOUNT", this.viewerLogger.bind(this));
        //Hook all state changes
        MyFreeCams.Model.on("vs", this.stateLogger.bind(this));
        MyFreeCams.Model.on("truepvt", this.stateLogger.bind(this));
        //Hook all camscore changes
        MyFreeCams.Model.on("camscore", this.camscoreLogger.bind(this));
        //Hook all topic changes
        MyFreeCams.Model.on("topic", this.topicLogger.bind(this));
        //Hook all rank changes
        MyFreeCams.Model.on("rank", this.rankLogger.bind(this));
        //@TODO - Probably need a sessionstate callback...or...I don't know, maybe not
        if (this.ready !== undefined && options.logmodelids !== true) {
            this.ready(this);
        }
    }
    Logger.prototype.start = function () {
        this.client.connect();
    };
    Logger.prototype.logChatFor = function (val) {
        var _this = this;
        //if this is a number, hook that model, if this is a function, hook all models and set up the filter
        //in either case, record what we're logging on the model object itself (maybe a sub "logState" object)
        switch (typeof val) {
            case "number":
                //Join the room and add a tracker to the model logState object so that chatLogger knows to log for this model
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
                    assert2.strictEquals(typeof v, "function", "Don't know how to log chat for " + v);
                    //@log2 "Hooking all models for //{k} with function //{v.toString()}"
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
                assert2.fail("Don't know how to log chat for " + val);
        }
        ;
    };
    Logger.prototype.logTipsFor = function (val) {
        var _this = this;
        switch (typeof val) {
            case "number":
                //Join the room and add a tracker to the model logState object so that tipLogger knows to log for this model
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
                    assert2.strictEquals(typeof v, "function", "Don't know how to log tips for " + v);
                    //@log2 "Hooking all models for //{k} with function //{v.toString()}"
                    MyFreeCams.Model.on(k, function (callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (this.setState(model.uid, "tips", true)) {
                                this.joinRoom(model);
                            }
                        }
                    }.bind(this, v));
                }
            default:
                assert2.fail("Don't know how to log tips for " + val);
        }
    };
    Logger.prototype.logViewersFor = function (val) {
        var _this = this;
        switch (typeof val) {
            case "number":
                //Join the room and add a tracker to the model logState object so that tipLogger knows to log for this model
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
                    assert2.strictEquals(typeof v, "function", "Don't know how to log viewers for " + v);
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
                assert2.fail("Don't know how to log tips for " + val);
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
                    assert2.strictEqual(typeof v, "function", "Don't know how to log " + prop + " for " + v);
                    MyFreeCams.Model.on(k, function (callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (prop == "truepvt") {
                                prop = "state";
                            }
                            this.setState(model.uid, prop, true);
                        }
                    }.bind(this, v));
                }
            default:
                assert2.fail("Don't know how to log " + prop + " for " + val);
        }
    };
    Logger.prototype.setState = function (id, state, value) {
        if (value === void 0) { value = true; }
        MyFreeCams.Model.getModel(id).logState = MyFreeCams.Model.getModel(id).logState || {};
        if (MyFreeCams.Model.getModel(id).logState[state] === value) {
            return false; //Did not change anything (was already set like this)
        }
        else {
            MyFreeCams.Model.getModel(id).logState[state] = value;
            return true; //Did change something
        }
    };
    // Enters the given model's chat room if we're not already in it
    Logger.prototype.joinRoom = function (model) {
        if (model.__haveJoinedRoom === undefined || model.__haveJoinedRoom === false) {
            log2("Joining room for " + model.nm, model.nm);
            this.client.joinRoom(model.uid);
            model.__haveJoinedRoom = true;
        }
    };
    Logger.prototype.leaveRoom = function (model) {
        //@TODO - I suppose we would call this if we were, say, recording tokens for models in the top 10 and one model dropped to //11...
        if (model.__haveJoinedRoom === true) {
            log2("Joining room for " + model.nm, model.nm);
            this.client.leaveRoom(model.uid);
            model.__haveJoinedRoom = false;
        }
    };
    // Below here are helper methods that log the various messages to the console and log files with some nice formatting
    Logger.prototype.chatLogger = function (packet) {
        if (packet.aboutModel.logState !== undefined &&
            packet.aboutModel.logState.chat !== true &&
            packet.chatString !== undefined) {
            log2(packet.chatString, packet.aboutModel.nm, this.chatFormat);
        }
    };
    Logger.prototype.tipLogger = function (packet) {
        if (packet.aboutModel.logState !== undefined &&
            packet.aboutModel.logState.tips !== true &&
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
    Logger.prototype.stateLogger = function (model, oldState, newState) {
        if (model.logState !== undefined && model.logState.state === true) {
            if (oldState !== newState) {
                var statestr = MyFreeCams.STATE[model.vs];
                if (model.bestSession.truepvt === 1 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                    statestr = "True Private";
                }
                if (model.bestSession.truepvt === 0 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                    statestr = "Regular Private";
                }
                log2(model.nm + " is now in state " + statestr, model.nm, this.basicFormat);
            }
        }
    };
    Logger.prototype.rankLogger = function (model, oldState, newState) {
        if (model.logState !== undefined && model.logState.rank === true) {
            if (oldState != undefined && oldState !== newState) {
                var format = newState > oldState ? this.rankDown : this.rankUp; //@BUGBUG - @TODO - This currently formats dropping below rank 250 as rankup and coming above rank 250 as rankdown....
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
            if (oldState !== newState) {
                log2("TOPIC: " + newState, model.nm, this.topicFormat);
            }
        }
    };
    Logger.prototype.camscoreLogger = function (model, oldState, newState) {
        if (model.logState !== undefined && model.logState.camscore === true) {
            if (oldState !== undefined && oldState !== newState) {
                var format = newState > oldState ? this.rankDown : this.rankUp;
                log2(model.nm + " camscore is now " + newState, model.nm, format);
            }
        }
    };
    Logger.prototype.viewerLogger = function (packet) {
        if (packet.aboutModel.logState !== undefined &&
            packet.aboutModel.logState.viewers === true) {
            if (packet.FCType === MyFreeCams.FCTYPE.GUESTCOUNT) {
                log2("Guest viewer count is now " + packet.nArg1, packet.aboutModel.nm);
                return;
            }
            //Otherwise this packet must be a JOINCHAN, a notification of a member (whether basic or premium) entering or leaving the room
            switch (packet.nArg2) {
                case MyFreeCams.FCCHAN.JOIN:
                    //@TODO - print "Basic user" or "Premium user" etc.  Also @TODO - Add these to packet.chatString (maybe)
                    log2("User " + packet.sMessage.nm + " (id: " + packet.nFrom + ", level: " + packet.sMessage.lv + ") joined the room.", packet.aboutModel.nm);
                case MyFreeCams.FCCHAN.PART: //The user left the channel, for this we get no sMessage, but nFrom will be that user's session id (NOT their user id)
                //Sometimes we get a leaving packet for a user when we never got their enter packet.  In this case, I don't think it's possible to
                //know the user's name, so skip those cases.
                //Otherwise, we'd need to be caching user names in FCCHAN.JOIN messages, which we're not doing here yet, so don't record chan.part messages for now
                //@TODO - @BUGBUG
                //log2(`User ${packet.nm} (id: ${packet.nFrom}) left the room.`, packet.aboutModel.nm);
                default:
                    assert2.fail("Don't know how to log viewer change for " + packet.toString());
            }
        }
    };
    return Logger;
}());
// log = new Logger(opts)
// log.start()
exports.Logger = Logger;
