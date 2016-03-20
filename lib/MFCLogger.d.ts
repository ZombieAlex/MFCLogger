/// <reference path="../node_modules/MFCAuto/lib/MFCAuto.d.ts" />
declare type LoggerFilter = (model: Model, beforeState: any, afterState: any) => boolean;
interface LoggerOptions {
    all: Array<number | {
        [index: string]: LoggerFilter;
    }>;
    nochat: Array<number | {
        [index: string]: LoggerFilter;
    }>;
    chat: Array<number | {
        [index: string]: LoggerFilter;
    }>;
    tips: Array<number | {
        [index: string]: LoggerFilter;
    }>;
    viewers: Array<number | {
        [index: string]: LoggerFilter;
    }>;
    rank: Array<number | {
        [index: string]: LoggerFilter;
    }>;
    topic: Array<number | {
        [index: string]: LoggerFilter;
    }>;
    state: Array<number | {
        [index: string]: LoggerFilter;
    }>;
    camscore: Array<number | {
        [index: string]: LoggerFilter;
    }>;
    logmodelids?: boolean;
}
declare class Logger {
    private client;
    private options;
    private ready;
    private MongoClient;
    private database;
    private collection;
    private basicFormat;
    private chatFormat;
    private topicFormat;
    private tinyTip;
    private smallTip;
    private mediumTip;
    private largeTip;
    private rankUp;
    private rankDown;
    constructor(client: Client, options: LoggerOptions, ready: any);
    private logChatFor(val);
    private logTipsFor(val);
    private logViewersFor(val);
    private logStateFor(val);
    private logCamScoreFor(val);
    private logTopicsFor(val);
    private logRankFor(val);
    private logForHelper(val, prop);
    private setState(id, state, value?);
    private joinRoom(model);
    private leaveRoom(model);
    private chatLogger(packet);
    private tipLogger(packet);
    private durationToString(duration);
    private stateLogger(model, oldState, newState);
    private rankLogger(model, oldState, newState);
    private topicLogger(model, oldState, newState);
    private camscoreLogger(model, oldState, newState);
    private viewerLogger(packet);
}
