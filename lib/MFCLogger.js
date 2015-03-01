var Logger,
  hasProp = {}.hasOwnProperty,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

Logger = (function() {
  function Logger(options, ready) {
    var i, j, k, l, len, len1, len2, len3, len4, len5, len6, len7, len8, m, model, n, o, p, q, r, ref, ref1, v;
    this.options = options;
    this.ready = ready;
    this.fs = require("fs");
    this.MyFreeCams = require("MFCAuto");
    this.log2 = this.MyFreeCams.log;
    this.client = new this.MyFreeCams.Client();
    this.MongoClient = require('mongodb').MongoClient;
    this.database = null;
    this.collection = null;
    this.color = require("cli-color");
    console.log(this.color.reset);
    this.basicFormat = this.color.bgBlack.white;
    this.chatFormat = this.color.bgBlack.white;
    this.topicFormat = this.color.bgBlack.cyan;
    this.tinyTip = this.color.bgBlackBright.black;
    this.smallTip = this.color.bgWhite.black;
    this.mediumTip = this.color.bgWhiteBright.black;
    this.largeTip = this.color.bgYellowBright.black;
    this.rankUp = this.color.bgCyan.black;
    this.rankDown = this.color.bgRed.white;
    ref = this.options;
    for (k in ref) {
      if (!hasProp.call(ref, k)) continue;
      v = ref[k];
      switch (k) {
        case "logmodelids":
          process.on('exit', (function(_this) {
            return function() {
              if (_this.database != null) {
                return _this.database.close;
              }
            };
          })(this));
          this.client.on("SESSIONSTATE", (function(_this) {
            return function(packet) {
              var id, obj;
              id = packet.nArg2;
              obj = packet.sMessage;
              if (obj.nm != null) {
                return _this.collection.findOne({
                  id: id
                }, function(err, doc) {
                  var ref1;
                  if (err) {
                    throw err;
                  }
                  if (doc != null) {
                    if (!(ref1 = obj.nm, indexOf.call(doc.names, ref1) >= 0)) {
                      doc.names.push(obj.nm);
                      return _this.collection.save(doc, function(err, result) {
                        if (err) {
                          return console.log(err);
                        }
                      });
                    }
                  } else {
                    return _this.collection.update({
                      id: id
                    }, {
                      id: id,
                      names: [obj.nm]
                    }, {
                      w: 1,
                      upsert: true
                    }, function(err, result) {
                      if (err) {
                        return console.log(err);
                      }
                    });
                  }
                });
              }
            };
          })(this));
          this.MongoClient.connect('mongodb://127.0.0.1:27017/Incoming', (function(_this) {
            return function(err, db) {
              if (err) {
                throw err;
              }
              _this.database = db;
              return db.collection('IDDB', function(err, col) {
                if (err) {
                  throw err;
                }
                if (col == null) {
                  throw "Failed to connect to mongo";
                }
                _this.collection = col;
                if (_this.ready != null) {
                  return _this.ready(_this);
                }
              });
            };
          })(this));
          break;
        case "all":
          console.assert({}.toString.call(this.options.all) === "[object Array]", "Invalid value for 'all' option");
          for (i = 0, len = v.length; i < len; i++) {
            model = v[i];
            this.logChatFor(model);
            this.logTipsFor(model);
            this.logStateFor(model);
            this.logCamScoreFor(model);
            this.logTopicsFor(model);
            this.logRankFor(model);
          }
          break;
        case "nochat":
          for (j = 0, len1 = v.length; j < len1; j++) {
            model = v[j];
            this.logTipsFor(model);
            this.logStateFor(model);
            this.logCamScoreFor(model);
            this.logTopicsFor(model);
            this.logRankFor(model);
          }
          break;
        case "chat":
          for (l = 0, len2 = v.length; l < len2; l++) {
            model = v[l];
            this.logChatFor(model);
            this.logTipsFor(model);
          }
          break;
        case "tips":
          for (m = 0, len3 = v.length; m < len3; m++) {
            model = v[m];
            this.logTipsFor(model);
          }
          break;
        case "viewers":
          for (n = 0, len4 = v.length; n < len4; n++) {
            model = v[n];
            this.logViewersFor(model);
          }
          break;
        case "rank":
          for (o = 0, len5 = v.length; o < len5; o++) {
            model = v[o];
            this.logRankFor(model);
          }
          break;
        case "topic":
          for (p = 0, len6 = v.length; p < len6; p++) {
            model = v[p];
            this.logTopicsFor(model);
          }
          break;
        case "state":
          for (q = 0, len7 = v.length; q < len7; q++) {
            model = v[q];
            this.logStateFor(model);
          }
          break;
        case "camscore":
          for (r = 0, len8 = v.length; r < len8; r++) {
            model = v[r];
            this.logCamScoreFor(model);
          }
          break;
        default:
          console.assert(false, "Unknown option '" + k + "''");
      }
    }
    this.client.on("CMESG", ((function(_this) {
      return function(packet) {
        return _this.chatLogger(packet);
      };
    })(this)));
    this.client.on("TOKENINC", (function(_this) {
      return function(packet) {
        return _this.tipLogger(packet);
      };
    })(this));
    this.client.on("JOINCHAN", (function(_this) {
      return function(packet) {
        return _this.viewerLogger(packet);
      };
    })(this));
    this.client.on("GUESTCOUNT", (function(_this) {
      return function(packet) {
        return _this.viewerLogger(packet);
      };
    })(this));
    this.MyFreeCams.Model.on("vs", (function(_this) {
      return function(model, oldstate, newstate) {
        return _this.stateLogger(model, oldstate, newstate);
      };
    })(this));
    this.MyFreeCams.Model.on("truepvt", (function(_this) {
      return function(model, oldstate, newstate) {
        return _this.stateLogger(model, oldstate, newstate);
      };
    })(this));
    this.MyFreeCams.Model.on("camscore", (function(_this) {
      return function(model, oldstate, newstate) {
        return _this.camscoreLogger(model, oldstate, newstate);
      };
    })(this));
    this.MyFreeCams.Model.on("topic", (function(_this) {
      return function(model, oldstate, newstate) {
        return _this.topicLogger(model, oldstate, newstate);
      };
    })(this));
    this.MyFreeCams.Model.on("rank", (function(_this) {
      return function(model, oldstate, newstate) {
        return _this.rankLogger(model, oldstate, newstate);
      };
    })(this));
    if ((this.ready != null) && !((ref1 = this.options) != null ? ref1.logmodelids : void 0)) {
      this.ready(this);
    }
  }

  Logger.prototype.start = function() {
    return this.client.connect();
  };

  Logger.prototype.logChatFor = function(val) {
    var k, results, v;
    switch (typeof val) {
      case "number":
        if (this.setState(val, "chat", true)) {
          return this.MyFreeCams.Model.getModel(val).on("vs", (function(_this) {
            return function(model, oldState, newState) {
              if (newState !== _this.MyFreeCams.STATE.Offline) {
                return _this.joinRoom(_this.MyFreeCams.Model.getModel(id));
              }
            };
          })(this));
        }
        break;
      case "object":
        results = [];
        for (k in val) {
          if (!hasProp.call(val, k)) continue;
          v = val[k];
          console.assert(typeof v === "function", "Don't know how to log chat for " + v);
          results.push(this.MyFreeCams.Model.on(k, ((function(_this) {
            return function(callback, model, oldState, newState) {
              if (callback(model, oldState, newState)) {
                if (_this.setState(model.uid, "chat", true)) {
                  return _this.joinRoom(model);
                }
              }
            };
          })(this)).bind(this, v)));
        }
        return results;
        break;
      default:
        return console.assert(false, "Don't know how to log chat for " + val);
    }
  };

  Logger.prototype.logTipsFor = function(val) {
    var k, results, v;
    switch (typeof val) {
      case "number":
        if (this.setState(val, "tips", true)) {
          return this.MyFreeCams.Model.getModel(val).on("vs", (function(_this) {
            return function(model, oldState, newState) {
              if (newState !== _this.MyFreeCams.STATE.Offline) {
                return _this.joinRoom(_this.MyFreeCams.Model.getModel(id));
              }
            };
          })(this));
        }
        break;
      case "object":
        results = [];
        for (k in val) {
          if (!hasProp.call(val, k)) continue;
          v = val[k];
          console.assert(typeof v === "function", "Don't know how to log tips for " + v);
          results.push(this.MyFreeCams.Model.on(k, ((function(_this) {
            return function(callback, model, oldState, newState) {
              if (callback(model, oldState, newState)) {
                if (_this.setState(model.uid, "tips", true)) {
                  return _this.joinRoom(model);
                }
              }
            };
          })(this)).bind(this, v)));
        }
        return results;
        break;
      default:
        return console.assert(false, "Don't know how to log tips for " + val);
    }
  };

  Logger.prototype.logViewersFor = function(val) {
    var k, results, v;
    switch (typeof val) {
      case "number":
        if (this.setState(val, "viewers", true)) {
          return this.MyFreeCams.Model.getModel(val).on("vs", (function(_this) {
            return function(model, oldState, newState) {
              _this.stateLogger(model, oldState, newState);
              if (newState !== _this.MyFreeCams.STATE.Offline) {
                return _this.joinRoom(_this.MyFreeCams.Model.getModel(id));
              }
            };
          })(this));
        }
        break;
      case "object":
        results = [];
        for (k in val) {
          if (!hasProp.call(val, k)) continue;
          v = val[k];
          console.assert(typeof v === "function", "Don't know how to log viewers for " + v);
          results.push(this.MyFreeCams.Model.on(k, ((function(_this) {
            return function(callback, model, oldState, newState) {
              if (callback(model, oldState, newState)) {
                if (_this.setState(model.uid, "viewers", true)) {
                  return _this.joinRoom(model);
                }
              }
            };
          })(this)).bind(this, v)));
        }
        return results;
        break;
      default:
        return console.assert(false, "Don't know how to log tips for " + val);
    }
  };

  Logger.prototype.logStateFor = function(val) {
    this.logForHelper(val, "state");
    return this.logForHelper(val, "truepvt");
  };

  Logger.prototype.logCamScoreFor = function(val) {
    return this.logForHelper(val, "camscore");
  };

  Logger.prototype.logTopicsFor = function(val) {
    return this.logForHelper(val, "topic");
  };

  Logger.prototype.logRankFor = function(val) {
    return this.logForHelper(val, "rank");
  };

  Logger.prototype.logForHelper = function(val, prop) {
    var k, results, v;
    switch (typeof val) {
      case "number":
        if (prop === "truepvt") {
          prop = "state";
        }
        return this.setState(val, prop, true);
      case "object":
        results = [];
        for (k in val) {
          if (!hasProp.call(val, k)) continue;
          v = val[k];
          console.assert(typeof v === "function", "Don't know how to log " + prop + " for " + v);
          results.push(this.MyFreeCams.Model.on(k, (function(callback, model, oldState, newState) {
            if (callback(model, oldState, newState)) {
              if (prop === "truepvt") {
                prop = "state";
              }
              return this.setState(model.uid, prop, true);
            }
          }).bind(this, v)));
        }
        return results;
        break;
      default:
        return console.assert(false, "Don't know how to log " + prop + " for " + val);
    }
  };

  Logger.prototype.setState = function(id, state, value) {
    if (value == null) {
      value = true;
    }
    this.MyFreeCams.Model.getModel(id).logState = this.MyFreeCams.Model.getModel(id).logState || {};
    if (this.MyFreeCams.Model.getModel(id).logState[state] === value) {
      return false;
    } else {
      this.MyFreeCams.Model.getModel(id).logState[state] = value;
      return true;
    }
  };

  Logger.prototype.joinRoom = function(model) {
    if ((model.__haveJoinedRoom == null) || model.__haveJoinedRoom === false) {
      this.log2("Joining room for " + model.nm, model.nm);
      this.client.joinRoom(model.uid);
      return model.__haveJoinedRoom = true;
    }
  };

  Logger.prototype.leaveRoom = function(model) {
    if (model.__haveJoinedRoom === true) {
      this.log2("Joining room for " + model.nm, model.nm);
      this.client.leaveRoom(model.uid);
      return model.__haveJoinedRoom = false;
    }
  };

  Logger.prototype.chatLogger = function(packet) {
    var ref, ref1;
    if ((packet != null ? (ref = packet.aboutModel) != null ? (ref1 = ref.logState) != null ? ref1.chat : void 0 : void 0 : void 0) && (packet != null ? packet.chatString : void 0)) {
      return this.log2(packet.chatString, packet.aboutModel.nm, this.chatFormat);
    }
  };

  Logger.prototype.tipLogger = function(packet) {
    var format, ref, ref1;
    if ((packet != null ? (ref = packet.aboutModel) != null ? (ref1 = ref.logState) != null ? ref1.tips : void 0 : void 0 : void 0) && (packet != null ? packet.chatString : void 0)) {
      format = this.tinyTip;
      if (packet.sMessage.tokens >= 50) {
        format = this.smallTip;
      }
      if (packet.sMessage.tokens >= 200) {
        format = this.mediumTip;
      }
      if (packet.sMessage.tokens >= 1000) {
        format = this.largeTip;
      }
      return this.log2(packet.chatString, packet.aboutModel.nm, format);
    }
  };

  Logger.prototype.stateLogger = function(model, oldState, newState) {
    var ref, statestr;
    if (model != null ? (ref = model.logState) != null ? ref.state : void 0 : void 0) {
      if (oldState !== newState) {
        statestr = this.MyFreeCams.STATE[model.vs];
        if (model.truepvt === 1 && model.vs === this.MyFreeCams.STATE.Private) {
          statestr = "True Private";
        }
        if (model.truepvt === 0 && model.vs === this.MyFreeCams.STATE.Private) {
          statestr = "Regular Private";
        }
        return this.log2(model.nm + " is now in state " + statestr, model.nm, this.basicFormat);
      }
    }
  };

  Logger.prototype.rankLogger = function(model, oldState, newState) {
    var format, ref;
    if (model != null ? (ref = model.logState) != null ? ref.rank : void 0 : void 0) {
      if ((oldState != null) && oldState !== newState) {
        format = newState > oldState ? this.rankDown : this.rankUp;
        if (oldState === 0) {
          oldState = "over 250";
        }
        if (newState === 0) {
          newState = "over 250";
        }
        this.log2(model.nm + " has moved from rank " + oldState + " to rank " + newState, model.nm, format);
        return this.log2(model.nm + " has moved from rank " + oldState + " to rank " + newState, "RANK_UPDATES", null);
      }
    }
  };

  Logger.prototype.topicLogger = function(model, oldState, newState) {
    var ref;
    if (model != null ? (ref = model.logState) != null ? ref.topic : void 0 : void 0) {
      if (oldState !== newState) {
        return this.log2("TOPIC: " + newState, model.nm, this.topicFormat);
      }
    }
  };

  Logger.prototype.camscoreLogger = function(model, oldSTate, newState) {
    var format, ref;
    if (model != null ? (ref = model.logState) != null ? ref.camscore : void 0 : void 0) {
      if ((typeof oldState !== "undefined" && oldState !== null) && oldState !== newState) {
        format = newstate > oldstate ? this.rankDown : this.rankUp;
        return this.log2(model.nm + " camscore is now " + newState, model.nm, format);
      }
    }
  };

  Logger.prototype.viewerLogger = function(packet) {
    var ref, ref1;
    if (packet != null ? (ref = packet.aboutModel) != null ? (ref1 = ref.logState) != null ? ref1.viewers : void 0 : void 0 : void 0) {
      if (packet.FCType === this.MyFreeCams.FCTYPE.GUESTCOUNT) {
        this.log2("Guest viewer count is now " + packet.nArg1, packet.aboutModel.nm);
        return;
      }
      switch (packet.nArg2) {
        case 1:
          return this.log2("User " + packet.sMessage.nm + " (id: " + packet.nFrom + ", level: " + packet.sMessage.lv + ") joined the room.", packet.aboutModel.nm);
        case 2:
          return this.log2("User " + packet.nm + " (id: " + packet.nFrom + ") left the room.", packet.aboutModel.nm);
        default:
          return console.assert(false, "Don't know how to log viewer change for " + (packet.toString()));
      }
    }
  };

  return Logger;

})();

exports.Logger = Logger;
