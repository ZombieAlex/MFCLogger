/// <reference path="../../typings/node/node.d.ts" />
/// <reference path="../../node_modules/MFCAuto/lib/MFCAuto.d.ts" />

/*
@TODO - switch to using nconf for the configuration?
*/

let fs = require("fs");
let mongodb = require("mongodb");
let color = require("cli-color");
let MyFreeCams = require("MFCAuto");
let log2 = MyFreeCams.log;
let assert2 = require("assert");


type LoggerFilter = (model: Model, beforeState: any, afterState: any) => boolean;
interface LoggerOptions {
    // Log all of the below, except viewers, for these models
    all: Array<number | { [index: string]: LoggerFilter }>;
    // Log all of the below, except chat and viewers, for these models
    nochat: Array<number | { [index: string]: LoggerFilter }>;
    // Log chat and tips for these models
    chat: Array<number | { [index: string]: LoggerFilter }>;
    tips: Array<number | { [index: string]: LoggerFilter }>;
    // Log guest counts and member names of people entering/leaving
    // the chat room
    viewers: Array<number | { [index: string]: LoggerFilter }>;
    // Log rank changes for these models
    rank: Array<number | { [index: string]: LoggerFilter }>;
    // Log topic changes for these models
    topic: Array<number | { [index: string]: LoggerFilter }>;
    // Log video state changes for these models
    state: Array<number | { [index: string]: LoggerFilter }>;
    // Log camscore changes for these models
    camscore: Array<number | { [index: string]: LoggerFilter }>;
    // For internal use only, stores a mapping of
    // model ids to model names in a local mongodb.
    // If that's useful to you and you have a local mongodb,
    // go for it, otherwise it's just for me (the author)
    logmodelids?: boolean;
}

class Logger {
    //Set up basic modules and fields
    private client: Client;
    private options: any;
    private ready: any;

    /////////////////////////////////////////
    //MongoDB support for recording model IDs
    private MongoClient = mongodb.MongoClient;
    private database = null;
    private collection = null;

    /////////////////////////////////////////
    //Color formatting
    private basicFormat = color.bgBlack.white;
    private chatFormat = color.bgBlack.white;
    private topicFormat = color.bgBlack.cyan;
    private tinyTip = color.bgBlackBright.black; // <50
    private smallTip = color.bgWhite.black; // <200, not actually yellow, more of a bold white, but still...
    private mediumTip = color.bgWhiteBright.black; // >200 and <1000
    private largeTip = color.bgYellowBright.black; // >1000
    private rankUp = color.bgCyan.black;
    private rankDown = color.bgRed.white;

    constructor(client: Client, options: LoggerOptions, ready) {
        this.client = client;
        this.options = options;
        this.ready = ready;

        /////////////////////////////////////
        //Color formatting
        console.log(color.reset);

        /////////////////////////////////////
        //Parse options
        for (let k in options) {
            if (!options.hasOwnProperty(k)) {
                continue;
            }
            let v = options[k];
            switch (k) {
                case "logmodelids":
                    // Mongo shape is {_id: mongoshit, id: <mfcid number>, names: [name1, name2, etc]}

                    //Save the db before exiting
                    process.on('exit', () => {
                        if (this.database !== null) {
                            this.database.close();
                        }
                    });

                    //Set up a sessionstate callback, which will record all the model IDs
                    this.client.on("SESSIONSTATE", (packet) => {
                        let id = packet.nArg2;
                        let obj = packet.sMessage;
                        if (obj !== undefined && obj.nm !== undefined) {
                            this.collection.findOne({ id }, (err, doc) => {
                                if (err) {
                                    throw err;
                                }
                                if (doc !== undefined) {
                                    if (doc.names.indexOf(obj.nm) === -1) { //We've not seen this name before
                                        doc.names.push(obj.nm);
                                        this.collection.save(doc, (err, result) => {
                                            if (err) {
                                                log2(err); //throw err
                                            }
                                        });
                                    }
                                } else {
                                    this.collection.update({ id }, { id, names: [obj.nm] }, { w: 1, upsert: true }, (err, result) => {
                                        if (err) {
                                            log2(err); //throw err
                                        }
                                    });
                                }
                            });
                        }
                    });
                    this.MongoClient.connect('mongodb://127.0.0.1:27017/Incoming', (err, db) => {
                        if (err) {
                            throw err;
                        }
                        this.database = db;
                        db.collection('IDDB', (err, col) => {
                            if (err) {
                                throw err;
                            }
                            if (col === undefined || col === null) {
                                throw new Error("Failed to connect to mongo");
                            }
                            this.collection = col;
                            if (ready !== undefined) {
                                this.ready(this);
                            }
                        });
                    });
                    break;
                case "all":
                    for (let model in v) {
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
                case "nochat":   //Convenience case for the common scenario of wanting to record tips and state changes for a model but just not chat
                    for (let model in v) {
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
                    for (let model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logChatFor(v[model]);
                        this.logTipsFor(v[model]); //Can't imagine wanting to log chat and not tips...
                    }
                    break;
                case "tips":
                    for (let model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logTipsFor(v[model]);
                    }
                    break;
                case "viewers":
                    for (let model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logViewersFor(v[model]);
                    }
                    break;
                case "rank":
                    for (let model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logRankFor(v[model]);
                    }
                    break;
                case "topic":
                    for (let model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logTopicsFor(v[model]);
                    }
                    break;
                case "state":
                    for (let model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logStateFor(v[model]);
                    }
                    break;
                case "camscore":
                    for (let model in v) {
                        if (!v.hasOwnProperty(model)) {
                            continue;
                        }
                        this.logCamScoreFor(v[model]);
                    }
                    break;
                default:
                    assert2.fail(`Unknown option '${k}'`);
            }
        };


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

        if (this.ready !== undefined && options.logmodelids !== true) {
            this.ready(this);
        }
    }
    logChatFor(val) {
        //if this is a number, hook that model, if this is a function, hook all models and set up the filter
        //in either case, record what we're logging on the model object itself (maybe a sub "logState" object)
        switch (typeof val) {
            case "number":
                //Join the room and add a tracker to the model logState object so that chatLogger knows to log for this model
                if (this.setState(val, "chat", true)) { //If we're not already logging this model's chat
                    MyFreeCams.Model.getModel(val).on("vs", (model, oldState, newState) => {
                        if (newState !== MyFreeCams.STATE.Offline) {
                            this.joinRoom(model);
                        }
                    });
                }
                break;
            case "object":
                for (let k in val) {
                    let v = val[k];
                    assert2.strictEqual(typeof v, "function", `Don't know how to log chat for ${JSON.stringify(v)}`);
                    MyFreeCams.Model.on(k, function(callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (this.setState(model.uid, "chat", true)) {
                                this.joinRoom(model);
                            }
                        }
                    }.bind(this, v));
                }
                break;
            default:
                assert2.fail(`Don't know how to log chat for ${JSON.stringify(val)}`);
        };
    }
    logTipsFor(val) {
        switch (typeof val) {
            case "number":
                //Join the room and add a tracker to the model logState object so that tipLogger knows to log for this model
                if (this.setState(val, "tips", true)) {
                    MyFreeCams.Model.getModel(val).on("vs", (model, oldState, newState) => {
                        if (newState !== MyFreeCams.STATE.Offline) {
                            this.joinRoom(model);
                        }
                    });
                }
                break;
            case "object":
                for (let k in val) {
                    let v = val[k];
                    assert2.strictEqual(typeof v, "function", `Don't know how to log tips for ${JSON.stringify(v)}`);
                    //@log2 "Hooking all models for //{k} with function //{v.toString()}"
                    MyFreeCams.Model.on(k, function(callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (this.setState(model.uid, "tips", true)) {
                                this.joinRoom(model)
                            }
                        }
                    }.bind(this, v));
                }
                break;
            default:
                assert2.fail(`Don't know how to log tips for ${JSON.stringify(val)}`);
        }
    }
    logViewersFor(val) { //@TODO - collapse these three logViewersFor, logTipsFor, logChatFor functions, they're too common not to share code
        switch (typeof val) {
            case "number":
                //Join the room and add a tracker to the model logState object so that tipLogger knows to log for this model
                if (this.setState(val, "viewers", true)) {
                    MyFreeCams.Model.getModel(val).on("vs", (model, oldState, newState) => {
                        this.stateLogger(model, oldState, newState)
                        if (newState !== MyFreeCams.STATE.Offline) {
                            this.joinRoom(model);
                        }
                    });
                }
                break;
            case "object":
                for (let k in val) {
                    let v = val[k];
                    assert2.strictEqual(typeof v, "function", `Don't know how to log viewers for ${JSON.stringify(v)}`);
                    MyFreeCams.Model.on(k, function(callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (this.setState(model.uid, "viewers", true)) {
                                this.joinRoom(model);
                            }
                        }
                    }.bind(this, v));
                }
                break;
            default:
                assert2.fail(`Don't know how to log viewers for ${JSON.stringify(val)}`);
        }
    }
    logStateFor(val) {
        this.logForHelper(val, "state");
        this.logForHelper(val, "truepvt");
    }
    logCamScoreFor(val) {
        this.logForHelper(val, "camscore");
    }
    logTopicsFor(val) {
        this.logForHelper(val, "topic");
    }
    logRankFor(val) {
        this.logForHelper(val, "rank");
    }
    logForHelper(val, prop) {
        switch (typeof val) {
            case "number":
                if (prop == "truepvt") { //Minor hack, could clean up later
                    prop = "state";
                }
                this.setState(val, prop, true);
            case "object":
                for (let k in val) {
                    let v = val[k];
                    assert2.strictEqual(typeof v, "function", `Don't know how to log ${prop} for ${JSON.stringify(v)}`);
                    MyFreeCams.Model.on(k, function(callback, model, oldState, newState) {
                        if (callback(model, oldState, newState)) {
                            if (prop == "truepvt") { //Minor hack, could clean up later
                                prop = "state"
                            }
                            this.setState(model.uid, prop, true);
                        }
                    }.bind(this, v));
                }
                break;
            default:
                assert2.fail(`Don't know how to log ${prop} for ${JSON.stringify(val)}`);
        }
    }
    setState(id, state, value = true) {
        MyFreeCams.Model.getModel(id).logState = MyFreeCams.Model.getModel(id).logState || {}
        if (MyFreeCams.Model.getModel(id).logState[state] === value) {
            return false; //Did not change anything (was already set like this)
        } else {
            MyFreeCams.Model.getModel(id).logState[state] = value;
            return true; //Did change something
        }
    }
    // Enters the given model's chat room if we're not already in it
    joinRoom(model) {
        if (model.__haveJoinedRoom === undefined || model.__haveJoinedRoom === false) { //@TODO - Move __haveJoinedRoom into the .logState sub-object like we have in logChatFor...
            log2(`Joining room for ${model.nm}`, model.nm);
            this.client.joinRoom(model.uid);
            model.__haveJoinedRoom = true;
        }
    }
    leaveRoom(model) {
        //@TODO - I suppose we would call this if we were, say, recording tokens for models in the top 10 and one model dropped to //11...
        if (model.__haveJoinedRoom === true) {
            log2(`Leaving room for ${model.nm}`, model.nm);
            this.client.leaveRoom(model.uid);
            model.__haveJoinedRoom = false;
        }
    }
    // Below here are helper methods that log the various messages to the console and log files with some nice formatting
    chatLogger(packet) {
        if (packet.aboutModel.logState !== undefined &&
            packet.aboutModel.logState.chat === true &&
            packet.chatString !== undefined) {
            log2(packet.chatString, packet.aboutModel.nm, this.chatFormat);
        }
    }
    tipLogger(packet) {
        if (packet.aboutModel.logState !== undefined &&
            packet.aboutModel.logState.tips === true &&
            packet.chatString !== undefined) {
            let format = this.tinyTip;
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
    }
    stateLogger(model, oldState, newState) {
        //If a model has gone offline
        if (newState === MyFreeCams.FCVIDEO.OFFLINE) {
            //Indicate that we are not in her room, so that
            //we'll issue another joinroom request when she logs back on
            //but don't actually leave her room (via leaveRoom())
            model.__haveJoinedRoom = false;
        }
        
        if (model.logState !== undefined && model.logState.state === true) {
            if (oldState !== newState) { //@TODO - Confirm that this still allows true private states to be logged
                let statestr = MyFreeCams.STATE[model.bestSession.vs];
                if (model.bestSession.truepvt === 1 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                    statestr = "True Private";
                }
                if (model.bestSession.truepvt === 0 && model.bestSession.vs === MyFreeCams.STATE.Private) {
                    statestr = "Regular Private";
                }
                log2(`${model.nm} is now in state ${statestr}`, model.nm, this.basicFormat);
            }
        }
    }
    rankLogger(model, oldState, newState) {
        if (model.logState !== undefined && model.logState.rank === true) {
            if (oldState != undefined && oldState !== newState) {
                let format = newState > oldState ? this.rankDown : this.rankUp //@BUGBUG - @TODO - This currently formats dropping below rank 250 as rankup and coming above rank 250 as rankdown....
                if (oldState === 0) {
                    oldState = "over 250";
                }
                if (newState === 0) {
                    newState = "over 250"
                }

                log2(`${model.nm} has moved from rank ${oldState} to rank ${newState}`, model.nm, format);
                log2(`${model.nm} has moved from rank ${oldState} to rank ${newState}`, "RANK_UPDATES", null);
            }
        }
    }
    topicLogger(model, oldState, newState) {
        if (model.logState !== undefined && model.logState.topic === true) {
            if (oldState !== newState) {
                log2(`TOPIC: ${newState}`, model.nm, this.topicFormat);
            }
        }
    }
    camscoreLogger(model, oldState, newState) {
        if (model.logState !== undefined && model.logState.camscore === true) {
            if (oldState !== newState) {
                let format = newState > oldState ? this.rankDown : this.rankUp;
                log2(`${model.nm} camscore is now ${newState}`, model.nm, format);
            }
        }
    }
    viewerLogger(packet) { // @TODO - Test this out, also need to hook it up to options so that people can opt in to this
        if (packet.aboutModel.logState !== undefined &&
            packet.aboutModel.logState.viewers === true) {

            if (packet.FCType === MyFreeCams.FCTYPE.GUESTCOUNT) {
                log2(`Guest viewer count is now ${packet.nArg1}`, packet.aboutModel.nm);
                return
            }

            //Otherwise this packet must be a JOINCHAN, a notification of a member (whether basic or premium) entering or leaving the room
            switch (packet.nArg2) {
                case MyFreeCams.FCCHAN.JOIN: //This user joined the channel and I think (but haven't verified) we always get a semi-full user object describing this user in sMessage
                    //@TODO - print "Basic user" or "Premium user" etc.  Also @TODO - Add these to packet.chatString (maybe)
                    log2(`User ${packet.sMessage.nm} (id: ${packet.nFrom}, level: ${packet.sMessage.lv}) joined the room.`, packet.aboutModel.nm);
                case MyFreeCams.FCCHAN.PART: //The user left the channel, for this we get no sMessage, but nFrom will be that user's session id (NOT their user id)
                //Sometimes we get a leaving packet for a user when we never got their enter packet.  In this case, I don't think it's possible to
                //know the user's name, so skip those cases.
                //Otherwise, we'd need to be caching user names in FCCHAN.JOIN messages, which we're not doing here yet, so don't record chan.part messages for now
                //@TODO - @BUGBUG
                //log2(`User ${packet.nm} (id: ${packet.nFrom}) left the room.`, packet.aboutModel.nm);
                default:
                    assert2.fail(`Don't know how to log viewer change for ${packet.toString()}`);
            }
        }
    }
}

// log = new Logger(opts)
// log.start()
exports.Logger = Logger;
