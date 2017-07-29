import * as mfc from "MFCAuto";
export declare enum LoggerCategories {
    all = 0,
    nochat = 1,
    chat = 2,
    tips = 3,
    viewers = 4,
    rank = 5,
    topic = 6,
    state = 7,
    camscore = 8,
}
export interface LoggerSelector {
    id?: number;
    what: LoggerCategories[];
    when?: (m: mfc.Model) => boolean;
    where?: string;
}
export declare class Logger {
    private logSets;
    private tempLogSets;
    private joinedRooms;
    private previousStates;
    private userSessionsToIds;
    private userIdsToNames;
    private joinRoomCategories;
    private client;
    private ready;
    private basicFormat;
    private chatFormat;
    private topicFormat;
    private rankUp;
    private rankDown;
    constructor(client: mfc.Client, selectors: LoggerSelector[], sqliteDBName: string, ready: (l: Logger) => void);
    private addTempLogging(category, m, filename);
    private removeTempLogging(category, m, filename);
    private addPermaLogging(category, m, filename);
    private shouldJoinRoom(model);
    private inCategory(model, category);
    private inCategories(model, categories);
    private fileLogging(categories, uid, msg, format?);
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
    private rcLogger(model, before, after);
    private doSqlite3(sqliteDBName);
}
