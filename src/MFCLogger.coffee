class Logger
    constructor: (@options, @ready) ->
        #Set up basic modules and fields
        @fs = require("fs")
        @MyFreeCams = require("MFCAuto")
        @log2 = @MyFreeCams.log
        @client = new @MyFreeCams.Client()

        #############
        #MongoDB support for recording model IDs
        @MongoClient = require('mongodb').MongoClient
        @database = null
        @collection = null

        #########################################################################
        #Color formatting
        @color = require("cli-color")
        console.log @color.reset
        @basicFormat = @color.bgBlack.white
        @chatFormat = @color.bgBlack.white
        @topicFormat = @color.bgBlack.cyan
        @tinyTip = @color.bgBlackBright.black # <50
        @smallTip = @color.bgWhite.black # <200, not actually yellow, more of a bold white, but still...
        @mediumTip = @color.bgWhiteBright.black # >200 and <1000
        @largeTip = @color.bgYellowBright.black # >1000
        @rankUp = @color.bgCyan.black
        @rankDown = @color.bgRed.white

        ######################################################
        #Parse options

        for own k,v of @options
            switch k
                when "logmodelids"
                    # Mongo shape is {_id: mongoshit, id: <mfcid number>, names: [name1, name2, etc]}

                    #Save the db before exiting
                    process.on 'exit', =>
                        if @database?
                            @database.close

                    #Set up a sessionstate callback, which will record all the model IDs
                    @client.on "SESSIONSTATE", (packet) =>
                        id = packet.nArg2
                        obj = packet.sMessage
                        if obj.nm?
                            @collection.findOne {id}, (err, doc) =>
                                if err
                                    throw err
                                if doc?
                                    if not (obj.nm in doc.names) #We've not seen this name before
                                        doc.names.push obj.nm
                                        @collection.save doc, (err, result) ->
                                            if err
                                                console.log err #throw err
                                else
                                    @collection.update {id}, {id, names: [obj.nm]}, {w:1, upsert: true}, (err, result) ->
                                        if err
                                            console.log err #throw err
                                    # @collection.insert {id, names: [obj.nm]}, (err, result) ->
                                    #     if err
                                    #         console.log err #throw err
                    @MongoClient.connect 'mongodb://127.0.0.1:27017/Incoming', (err, db) =>
                        if err
                            throw err
                        @database = db
                        db.collection 'IDDB', (err,col) =>
                            if err
                                throw err
                            if not col?
                                throw "Failed to connect to mongo"
                            @collection = col
                            if @ready?
                                @ready(this)
                when "all"
                    console.assert({}.toString.call(@options.all) is "[object Array]", "Invalid value for 'all' option")
                    for model in v
                        @logChatFor model
                        @logTipsFor model
                        @logStateFor model
                        @logCamScoreFor model
                        @logTopicsFor model
                        @logRankFor model
                when "nochat"   #Convenience case for the common scenario of wanting to record tips and state changes for a model but just not chat
                    for model in v
                        @logTipsFor model
                        @logStateFor model
                        @logCamScoreFor model
                        @logTopicsFor model
                        @logRankFor model
                when "chat"
                    for model in v
                        @logChatFor model
                        @logTipsFor model   #Can't imagine wanting to log chat and not tips...
                when "tips"
                    for model in v
                        @logTipsFor model
                when "viewers"
                    for model in v
                        @logViewersFor model
                when "rank"
                    for model in v
                        @logRankFor model
                when "topic"
                    for model in v
                        @logTopicsFor model
                when "state"
                    for model in v
                        @logStateFor model
                when "camscore"
                    for model in v
                        @logCamScoreFor model
                else
                    console.assert false, "Unknown option '#{k}''"


        #Finally set up the callbacks for tip and chat messages

        #Hook all chat, filtering to the desired chat in the chatLogger function
        @client.on "CMESG", ((packet) => @chatLogger(packet))

        #Hook all tips
        @client.on "TOKENINC", (packet) => @tipLogger(packet)

        #Hook all room viewer join/leaves
        @client.on "JOINCHAN", (packet) => @viewerLogger(packet)
        @client.on "GUESTCOUNT", (packet) => @viewerLogger(packet)

        #Hook all state changes
        @MyFreeCams.Model.on "vs", (model, oldstate, newstate) => @stateLogger(model, oldstate, newstate)
        @MyFreeCams.Model.on "truepvt", (model, oldstate, newstate) => @stateLogger(model, oldstate, newstate)

        #Hook all camscore changes
        @MyFreeCams.Model.on "camscore", (model, oldstate, newstate) => @camscoreLogger(model, oldstate, newstate)

        #Hook all topic changes
        @MyFreeCams.Model.on "topic", (model, oldstate, newstate) => @topicLogger(model, oldstate, newstate)

        #Hook all rank changes
        @MyFreeCams.Model.on "rank", (model, oldstate, newstate) => @rankLogger(model, oldstate, newstate)
        #@TODO - Probably need a sessionstate callback...or...I don't know, maybe not

        if @ready? and not @options?.logmodelids
            @ready(this)
    start: -> @client.connect()
    logChatFor: (val) ->
        #if this is a number, hook that model, if this is a function, hook all models and set up the filter
        #in either case, record what we're logging on the model object itself (maybe a sub "logState" object)
        switch typeof val
            when "number"
                #Join the room and add a tracker to the model logState object so that chatLogger knows to log for this model
                if (@setState val, "chat", true) #If we're not already logging this model's chat
                    @MyFreeCams.Model.getModel(val).on "vs", (model,oldState,newState) =>
                        if newState isnt @MyFreeCams.STATE.Offline
                            @joinRoom @MyFreeCams.Model.getModel(id)
            when "object"
                for own k,v of val
                    console.assert typeof v is "function", "Don't know how to log chat for #{v}"
                    #@log2 "Hooking all models for #{k} with function #{v.toString()}"
                    @MyFreeCams.Model.on k, ((callback, model, oldState, newState) =>
                        if callback(model, oldState, newState)
                            if (@setState model.uid, "chat", true)
                                @joinRoom model).bind(this,v);
            else
                console.assert false, "Don't know how to log chat for #{val}"
    logTipsFor: (val) ->
        switch typeof val
            when "number"
                #Join the room and add a tracker to the model logState object so that tipLogger knows to log for this model
                if (@setState val, "tips", true)
                    @MyFreeCams.Model.getModel(val).on "vs", (model,oldState,newState) =>
                        if newState isnt @MyFreeCams.STATE.Offline
                            @joinRoom @MyFreeCams.Model.getModel(id)
            when "object"
                for own k,v of val
                    console.assert typeof v is "function", "Don't know how to log tips for #{v}"
                    #@log2 "Hooking all models for #{k} with function #{v.toString()}"
                    @MyFreeCams.Model.on k, ((callback, model, oldState, newState) =>
                        if callback(model, oldState, newState)
                            if (@setState model.uid, "tips", true)
                                @joinRoom model).bind(this,v)
            else
                console.assert false, "Don't know how to log tips for #{val}"
    logViewersFor: (val) -> #@TODO - collapse these three logViewersFor, logTipsFor, logChatFor functions, they're too common not to share code
        switch typeof val
            when "number"
                #Join the room and add a tracker to the model logState object so that tipLogger knows to log for this model
                if (@setState val, "viewers", true)
                    @MyFreeCams.Model.getModel(val).on "vs", (model,oldState,newState) =>
                        @stateLogger(model,oldState,newState)
                        if newState isnt @MyFreeCams.STATE.Offline
                            @joinRoom @MyFreeCams.Model.getModel(id)
            when "object"
                for own k,v of val
                    console.assert typeof v is "function", "Don't know how to log viewers for #{v}"
                    #@log2 "Hooking all models for #{k} with function #{v.toString()}"
                    @MyFreeCams.Model.on k, ((callback, model, oldState, newState) =>
                        if callback(model, oldState, newState)
                            if (@setState model.uid, "viewers", true)
                                @joinRoom model).bind(this,v)
            else
                console.assert false, "Don't know how to log tips for #{val}"
    logStateFor: (val) ->
        @logForHelper(val, "state")
        @logForHelper(val, "truepvt")
    logCamScoreFor: (val) -> @logForHelper(val, "camscore")
    logTopicsFor: (val) -> @logForHelper(val, "topic")
    logRankFor: (val) -> @logForHelper(val, "rank")
    logForHelper: (val, prop) ->
        switch typeof val
            when "number"
                if prop == "truepvt" #Minor hack, could clean up later
                    prop = "state"
                @setState val, prop, true
            when "object"
                for own k,v of val
                    console.assert typeof v is "function", "Don't know how to log #{prop} for #{v}"
                    #@log2 "Hooking all models for #{k} with function #{v.toString()}"
                    @MyFreeCams.Model.on k, ((callback, model, oldState, newState) ->
                        if callback(model, oldState, newState)
                            if prop == "truepvt" #Minor hack, could clean up later
                                prop = "state"
                            @setState model.uid, prop, true).bind(this,v)
            else
                console.assert false, "Don't know how to log #{prop} for #{val}"
    setState: (id, state, value = true) ->
        # @log2 "setState invoked #{id}, #{state}, #{value}"
        @MyFreeCams.Model.getModel(id).logState = @MyFreeCams.Model.getModel(id).logState || {} #Is this valid coffeescript?
        if @MyFreeCams.Model.getModel(id).logState[state] is value
            false #Did not change anything (was already set like this)
        else
            @MyFreeCams.Model.getModel(id).logState[state] = value
            true #Did change something
    # Enters the given model's chat room if we're not already in it
    joinRoom: (model) ->
        if not model.__haveJoinedRoom? or model.__haveJoinedRoom is false #@TODO - Move __haveJoinedRoom into the .logState sub-object like we have in logChatFor...
            @log2 "Joining room for #{model.nm}", model.nm
            @client.joinRoom model.uid
            model.__haveJoinedRoom = true
    leaveRoom: (model) ->
        #@TODO - I suppose we would call this if we were, say, recording tokens for models in the top 10 and one model dropped to #11...
        if model.__haveJoinedRoom is true
            @log2 "Joining room for #{model.nm}", model.nm
            @client.leaveRoom model.uid
            model.__haveJoinedRoom = false
    # Helper that avoids hooking the same model twice for something
    # hookOnce: (models, property, func) ->
    #     if typeof models is number
    #         models = [number]
    #     if models is "All"
    #         #@TODO - Something
    #     else
    #         #@TODO - Something
    # Below here are helper methods that log the various messages to the console and log files with some nice formatting
    chatLogger: (packet) ->
        if packet?.aboutModel?.logState?.chat and packet?.chatString
            @log2 packet.chatString, packet.aboutModel.nm, @chatFormat
    tipLogger: (packet) ->
        if packet?.aboutModel?.logState?.tips and packet?.chatString
            format = @tinyTip
            format = @smallTip if packet.sMessage.tokens >= 50
            format = @mediumTip if packet.sMessage.tokens >= 200
            format = @largeTip if packet.sMessage.tokens >= 1000
            @log2 packet.chatString, packet.aboutModel.nm, format
    stateLogger: (model, oldState, newState) ->
        if model?.logState?.state
            if oldState isnt newState #@TODO - Confirm that this still allows true private states to be logged
                statestr = @MyFreeCams.STATE[model.vs]
                statestr = "True Private" if model.truepvt is 1 and model.vs is @MyFreeCams.STATE.Private
                statestr = "Regular Private" if model.truepvt is 0 and model.vs is @MyFreeCams.STATE.Private
                @log2 "#{model.nm} is now in state #{statestr}", model.nm, @basicFormat
    rankLogger: (model, oldState, newState) ->
        # @log2 "rankLogger invoked: #{packet?.aboutModel?.logState?.rank}, new rank: #{newState}"
        if model?.logState?.rank
            if oldState? and oldState isnt newState
                format = if newState > oldState then @rankDown else @rankUp #@BUGBUG - @TODO - This currently formats dropping below rank 250 as rankup and coming above rank 250 as rankdown....
                oldState = "over 250" if oldState is 0
                newState = "over 250" if newState is 0

                @log2 "#{model.nm} has moved from rank #{oldState} to rank #{newState}", model.nm, format
                @log2 "#{model.nm} has moved from rank #{oldState} to rank #{newState}", "RANK_UPDATES", null
    topicLogger: (model, oldState, newState) ->
        if model?.logState?.topic
            if oldState isnt newState
                @log2 "TOPIC: #{newState}", model.nm, @topicFormat
    camscoreLogger: (model, oldSTate, newState) ->
        if model?.logState?.camscore
            if oldState? and oldState isnt newState
                format = if newstate > oldstate then @rankDown else @rankUp
                @log2 "#{model.nm} camscore is now #{newState}", model.nm, format
    viewerLogger: (packet) -> # @TODO - Test this out, also need to hook it up to options so that people can opt in to this
        #Otherwise this packet must be a JOINCHAN, a notification of a member (whether basic or premium) entering or leaving the room
        if packet?.aboutModel?.logState?.viewers
            if packet.FCType == @MyFreeCams.FCTYPE.GUESTCOUNT
                @log2 "Guest viewer count is now #{packet.nArg1}", packet.aboutModel.nm
                return

            switch packet.nArg2
                when 1 #This user joined the channel and I think (but haven't verified) we always get a semi-full user object describing this user in sMessage
                    #userHash[packet.aboutModel.uid][packet.nFrom] = packet.sMessage; //Add this user to the model's room list, so we can look up their name when they leave...
                    @log2 "User #{packet.sMessage.nm} (id: #{packet.nFrom}, level: #{packet.sMessage.lv}) joined the room.", packet.aboutModel.nm #@TODO - print "Basic user" or "Premium user" etc.  Also @TODO - Add these to packet.chatString
                when 2 #The user left the channel, for this we get no sMessage, but nFrom will be that user's session id (NOT their user id)
                    #Sometimes we get a leaving packet for a user when we never got their enter packet.  In this case, I don't think it's possible to
                    #know the user's name, so skip this.  @TODO - Warrants more investigation.  Is this user a model maybe?  In which case maybe we already got
                    #their user info some other way and MFC is optimizing by not sending it twice?  That's a wild guess.
                    #if(userHash[packet.aboutModel.uid][packet.nFrom] !== undefined){
                    @log2 "User #{packet.nm} (id: #{packet.nFrom}) left the room.", packet.aboutModel.nm  #@TODO - I think I don't have the name here, and I don't build up the client Model cache for non-sessionstate packets (maybe I should...)
                    #    delete userHash[packet.aboutModel.uid][packet.nFrom];
                    #}
                    #break;
                else
                    console.assert false, "Don't know how to log viewer change for #{packet.toString()}"


# log = new Logger(opts)
# log.start()
exports.Logger = Logger
