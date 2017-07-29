#MFCLogger.js
Simplifies logging MFC chat or status changes to the console and log files.  And provides a flexible set of options for specifying what to log for which model. This module requires MFCAuto separately as it takes an MFCAuto Client object as a constructor parameter.

All logs will be printed to the console, with color coding, and to separate log files in the local directory for each model. So depending on the options you pass to it, be prepared for a lot of text files to be created in the local folder.

##Example
This exists in the repo as src/test/test.js. Feel free to run it from there.

```javascript
"use strict";

let mfc = require("MFCAuto");
let client = new mfc.Client();
let lgr = require("MFCLogger");
let Logger = lgr.Logger;
let cat = lgr.LoggerCategories;

let options = [
    // Log everything for AspenRae and MissMolly to files names after them
    { id: 3111899, what: [cat.all] },
    { id: 11972850, what: [cat.all] },
    // Log camscore and rank for CrazyM to a file named after her, but only when she has more than 500 viewers in her room
    { id: 4585086, what: [cat.camscore, cat.rank], when: (m) => m.bestSession.rc > 500 },
    // Log only rank changes for models in the top 1000 to RANK.txt
    { what: [cat.rank], when: (m) => m.bestSession.rank !== undefined && m.bestSession.rank !== 0, where: "RANK" },
    // Log only tips received for models in the top 60 to TIPS.txt
    { what: [cat.tips], when: (m) => m.bestSession.rank !== undefined && m.bestSession.rank !== 0 && m.bestSession.rank <= 60, where: "TIPS" },
    // Log only topic changes for models with 'athletic' in their tags or models with 'raffle' in their topic to ATHLETIC.txt and RANK.txt
    { what: [cat.topic], when: (m) => m.tags.findIndex((value) => /athletic/i.test(value)) !== -1, where: "ATHLETIC" },
    { what: [cat.topic], when: (m) => /raffle/i.test(m.bestSession.topic), where: "RAFFLES" }
];

new Logger(client, options);
client.connect();
```

##Options
Options should be an array of LoggerSelector elements as defined in TypeScript below. Models are selected via their ID directly or a filter function. When using a filter function, logging will start for the model when she matches the filter and stop when she ceases matching the filter.

```typescript
enum LoggerCategories {
    // Log all of the below, except viewers, for these models
    all,
    // Log all of the below, except chat and viewers, for these models
    nochat,
    // Log chat and tips for these models
    chat,
    // Log tips but not chat for these models
    tips,
    // Log room counts and member names of people entering/leaving
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
    when?: (m: Model) => boolean; // When not given, when is equivalent to (m) => true
    where?: string; // What log file to log into, if not specified, a log file matching the model's current name will be used
}
```