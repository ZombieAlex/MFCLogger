var Logger = require('./lib/MFCLogger');

for(var key in Logger){
    if(Logger.hasOwnProperty(key)){
        exports[key] = Logger[key];
    }
}
