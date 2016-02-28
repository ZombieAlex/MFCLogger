(function() {
  var Logger, log, opts, mfc, client;

  opts = {
    all: [
      {
        camscore: function(model, oldstate, newstate) {
          return newstate > 8000;
        },
        rc: function(model, oldstate, newstate) {
          return newstate > 1500;
        },
        rank: function(model, oldstate, newstate) {
          return newstate !== 0 && newstate <= 20;
        }
      }
    ],
    rank: [
      {
        rank: function(a, b, c) {
          return c !== 0;
        }
      }
    ]
  };

  mfc = require("MFCAuto");
  client = new mfc.Client();
  Logger = require("../../lib/MFCLogger.js").Logger;

  log = new Logger(client, opts);

  client.connect();

}).call(this);
