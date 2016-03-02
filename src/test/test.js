/* jshint node: true, nonstandard: true, esversion: 6, indent: 4, undef: true, unused: true, bitwise: true, eqeqeq: true, latedef: true, trailing: true */
"use strict";

let mfc = require("MFCAuto");
let client = new mfc.Client();
let Logger = require("../../lib/MFCLogger.js").Logger;

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
