"use strict";

let mfc = require("MFCAuto");
let client = new mfc.Client();
let lgr = require("../../lib/MFCLogger.js");
let Logger = lgr.Logger;
let cat = lgr.LoggerCategories;

let options = [
    // Log everything for AspenRae and MissMolly to files names after them
    { id: 3111899, what: [cat.all] },
    { id: 11972850, what: [cat.all] },
    // Log camscore and rank for CrazyM to a file named after her, but only when she has more than 500 viewers in her room
    { id: 4585086, what: [cat.camscore, cat.rank], when: (m) => m.bestSession.rc > 500 },
    // Log state changes for models in the top 10 to STATES.txt
    { what: [cat.state], when: (m) => m.bestSession.rank <= 10, where: "STATES" },
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
