"use strict";

let mfc = require("MFCAuto");
let client = new mfc.Client();
let lgr = require("../../lib/MFCLogger.js");
let Logger = lgr.Logger;
let cat = lgr.LoggerCategories;

let options = [
    // Log everything for AspenRae and MissMolly
    { id: 3111899, what: [cat.all] },
    { id: 11972850, what: [cat.all] },
    // Log camscore and rank for CrazyM but only when she has more than 500 viewers in her room
    { id: 4585086, what: [cat.camscore, cat.rank], when: (m) => m.bestSession.rc > 500 },
    // Log only rank changes for models in the top 250
    { what: [cat.rank], when: (m) => m.bestSession.rank !== undefined && m.bestSession.rank !== 0 },
    // Log only tips received for models in the top 60
    { what: [cat.tips], when: (m) => m.bestSession.rank !== undefined && m.bestSession.rank !== 0 && m.bestSession.rank <= 60 },
    // Log only topic changes for models with 'athletic' in their tags or models with 'raffle' in their topic
    { what: [cat.topic], when: (m) => m.tags.findIndex((value) => /athletic/i.test(value)) !== -1 },
    { what: [cat.topic], when: (m) => /raffle/i.test(m.bestSession.topic) }
];

new Logger(client, options);
client.connect();
