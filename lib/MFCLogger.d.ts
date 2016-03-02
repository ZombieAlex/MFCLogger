

declare let fs: any;
declare let mongodb: any;
declare let color: any;
declare let MyFreeCams: any;
declare let log2: any;
declare let assert2: any;
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
    logChatFor(val: any): void;
    logTipsFor(val: any): void;
    logViewersFor(val: any): void;
    logStateFor(val: any): void;
    logCamScoreFor(val: any): void;
    logTopicsFor(val: any): void;
    logRankFor(val: any): void;
    logForHelper(val: any, prop: any): void;
    setState(id: any, state: any, value?: boolean): boolean;
    joinRoom(model: any): void;
    leaveRoom(model: any): void;
    chatLogger(packet: any): void;
    tipLogger(packet: any): void;
    stateLogger(model: any, oldState: any, newState: any): void;
    rankLogger(model: any, oldState: any, newState: any): void;
    topicLogger(model: any, oldState: any, newState: any): void;
    camscoreLogger(model: any, oldState: any, newState: any): void;
    viewerLogger(packet: any): void;
}
