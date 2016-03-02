#MFCLogger.js
Simplifies logging MFC chat or status changes to the console and log files.  And provides a flexible set of options for specifying what to log for which model. This module requires MFCAuto separately as it takes an MFCAuto Client object as a constructor parameter.

All logs will be printed to the console, with color coding, and to separate log files in the local directory for each model. So depending on the options you pass to it, be prepared for a lot of text files to be created in the local folder.

##Example
This exists in the repo as src/test/test.js. Feel free to run it from there.

```javascript
let mfc = require("MFCAuto");
let client = new mfc.Client();
let Logger = require("MFCLogger").Logger;

let options = {
    // Log everything for...
    all: [
        // AspenRae
        3111899,
        // MissMolly
        11972850
    ],
    
    // Log rank changes for...
    rank: [
        // Models whose rank is in the top 250
        { rank: (model, before, after) => after !== 0 }
    ],
    
    // Log tips received for...
    tips: [
        // Models whose rank is in the top 10
        { rank: (model, before, after) => after !== 0 && after <= 10 }
    ],
    
    // Log topic changes for...
    topic: [
        // Models with 'athletic' in their tags and models with 'raffle' in their topic
        {
            tags: (model, before, after) => after.findIndex((value) => /athletic/i.test(value)) !== -1,
            topic: (model, before, after) => /raffle/i.test(after)
        }
    ]
};

let log = new Logger(client, options);
client.connect();
```

##Options
As defined in TypeScript below. Models can be specified via their ID directly or selected with a filter object. Hopefully the above example explains the filter object somewhat. If it's unclear, reviewing the MFCAuto documentation for the Model.on function might help.

```typescript
type LoggerFilter = (model: Model, beforeState: any, afterState: any) => boolean;
interface LoggerOptions{
    // Log all of the below, except viewers, for these models
    all: Array<number | {[index:string]: LoggerFilter}>;
    // Log all of the below, except chat and viewers, for these models
    nochat: Array<number | {[index:string]: LoggerFilter}>;
    // Log chat and tips for these models
    chat: Array<number | {[index:string]: LoggerFilter}>;
    tips: Array<number | {[index:string]: LoggerFilter}>;
    // Log guest counts and member names of people entering/leaving
    // the chat room
    viewers: Array<number | {[index:string]: LoggerFilter}>;
    // Log rank changes for these models
    rank: Array<number | {[index:string]: LoggerFilter}>;
    // Log topic changes for these models
    topic: Array<number | {[index:string]: LoggerFilter}>;
    // Log video state changes for these models
    state: Array<number | {[index:string]: LoggerFilter}>;
    // Log camscore changes for these models
    camscore: Array<number | {[index:string]: LoggerFilter}>;
}
```