(function(exports, globals) {
	"use strict";
	var require = typeof require !== "undefined" ? require : function(p) {
		return globals[p];
	};
	var toolous = require("toolous");

	//=============================Callback lists=============================
	/**
	 * Utility object to contain a list of callbacks that can be fired with arguments and a context. <br/>
	 * Callback lists can be configured to delete listeners upon file (i.e. 'once'),
	 * and/or to retain last fired arguments and context to send to newly add listeners (i.e. 'memory')
	 * @param {Object} options optional callback options
	 * @param {boolean} options.once  true if to remove listeners after firing. (default=false)
	 * @param {boolean} options.memory true if to keep the last value (and context) in memory and fire on new listeners (default=true)
	 */
	function CallbackList(options) {
		this._callbacks = [];
		this.options = toolous.merge({
			once : false,
			memory : true
		}, options);
	}

	/**
	 * Binds cb as a listener for this CallbackList. <br/>
	 * If there is a last value stored in memory (only if constructed with memory=true), cb is immediately called (and if once===true) then removed as a listener.
	 */
	CallbackList.prototype.add = function(cb) {
		this._callbacks.push(cb);
		if (this.firedArgs) {//memory, firedArgs is always trueish if exists (since it is an array)
			this.fireWith.apply(this, [this.firedContext].concat(this.firedArgs));
			//also removes the listener if once===true
		}
		return this;
	};
	/**
	 * Fires all listeners with the given context and any arguments given after it
	 * @param {any} context the context to fire the callbacks with
	 * @param {any...} args the arguments to send all callback listeners
	 */
	CallbackList.prototype.fireWith = function(context) {
		var args = toolous.toArray(arguments, 1);
		//ignore context as a parameter to the callback
		if (this.options.memory) {//store value in memory
			this.firedArgs = args;
			this.firedContext = context;
		}
		toolous.forEach(this._callbacks, function(cb) {
			cb.apply(context, args);
		});
		if (this.options.once) {//clean listeners
			this._callbacks = [];
		}
		return this;
	};
	/**
	 * Fires all listeners with the null context and any arguments given to fire.<br/>
	 * Equals to fireWith(nul,...)
	 * @param {any...} args the arguments to send all callback listeners
	 */
	CallbackList.prototype.fire = function() {//Fire without context
		return this.fireWith.apply(this, toolous.toArray(arguments, 0, null));
	};
	//===========================END Callback lists===========================

	//========================= Finite State Machine =========================
	/**
	 * Finite State Machine (Or a flying spaghetti monster). <br/>
	 * A finite state machine has a state (string), and fires events when the state changes
	 * @param {Object} options Optional options object of the following format:
	 * @param {string} options.state the initial state name. (default="initial")
	 * @param {Object} options.stateOptions map between state names to their specific options. of the form {stateName: {once:bool, memory: bool, finalState: bool}}
	 * @param {boolean} options.once Default once value for states that don't have a specific once value in options.stateOptions.  true if to remove listeners after firing. (default=true)
	 * @param {boolean} options.memory Default memory value for states that don't have a specific memory value in options.stateOptions.  true if to keep the last value (and context) in memory and fire on new listeners (default=true)
	 * @param {boolean}: options.finalState: Default finalState value for states that don't have a specific finalState value in options.stateOptions. - true if the FSM cannot change states once in this one. (default=false)
	 */
	function FSM(options) {
		options = toolous.merge({
			state : "initial"
		}, options);

		this._state = String(options.state);
		this._listeners = {};
		this._stateOpts = toolous.nvl(options.statesOptions, {});
		this._actualStateOpts = {};

		this._stateOptDefs = {
			once : !!toolous.nvl(options.once, true),
			memory : !!toolous.nvl(options.memory, true),
			finalState : !!toolous.nvl(options.finalState, false)
		};
	}

	/**
	 * Returns the actual state options for <code>state</code>, as a merge between the default state options and the specific state options if any
	 * @param {Object} state
	 */
	FSM.prototype._getStateOptions = function(state) {
		var actual = this._actualStateOpts[state];
		if (!toolous.isDef(actual)) {
			this._actualStateOpts[state] = actual = toolous.merge({}, this._stateOptDefs, this._stateOpts[state]);
		}
		return actual;
	};
	FSM.prototype._getCallbackList = function(state) {
		var cbList = this._listeners[state];
		if (!cbList) {//create CallbackList
			var cblOptions = this._getStateOptions(state);
			this._listeners[state] = cbList = new CallbackList(cblOptions);
		}
		return cbList;
	};
	/**
	 * Adds func as a listener when the state changes to <code>state<code>
	 * @param {Object} state
	 * @param {Object} func
	 */
	FSM.prototype.on = function(state, func) {
		state = String(state);
		var cbList = this._getCallbackList(state);
		cbList.add(func);
	};

	/**
	 * If state is defined, attempts to change to it, firing any listeners upon change. <br/>
	 * Trying to change from a final state has no effect, doesn't any event listeners and returns false.
	 * @param {string} state the state name to change into. undefined has no affect and just retrieves the state.
	 * @return the state after the change (if any change occurred) or false if trying to change from a final state.
	 */
	FSM.prototype.state = function(state,context) {
		if (toolous.isDef(state)) {//change
			var currentStateOptions = this._getStateOptions(this._state);
			//check if final
			if (currentStateOptions.finalState) {
				return false;
				//Cannot change.
			}
			this._state = state = String(state);
			var args = toolous.toArray(arguments, 2, context); //removing state and context
			//skipping state
			var cbList = this._getCallbackList(state);
			cbList.fireWith.apply(cbList, args);
		}
		//get
		return this._state;
	};
	//======================= END Finite State Machine =======================

	//=============================== Deferred ===============================
	var PROMISE_FUNCTIONS = ["state", "then", "done", "fail", "always", "pipe", "progress"];
	var STATES = {
		resolved : {
			fire : "resolve",
			listen : "done",
			thenIndex : 0,
			memory : true,
			once : true,
			query : "isResolved",
			finalState : true
		},
		rejected : {
			fire : "reject",
			listen : "fail",
			thenIndex : 1,
			memory : true,
			once : true,
			query : "isRejected",
			finalState : true
		},
		pending : {
			fire : "notify",
			listen : "progress",
			thenIndex : 2,
			memory : true,
			once : false
		}
	};

	/**
	 * Promise exposes the only promise's set of methods from a deferred object.
	 * @param {Object} deferred the deferred object of which methods to expose
	 * @param {any} this either a newly created object (when used with new), or an object to copy all of the promise methods to.
	 */
	function Promise(deferred) {
		var promise = this;
		toolous.forEach(PROMISE_FUNCTIONS, function(funcName) {
			promise[funcName] = function() {
				var ret = deferred[funcName].apply(deferred, arguments);
				return ret === deferred ? promise : ret;
				//Not returning the deferred object.
			};
		});
		promise.promise = function() {
			return this;
		};
	}
	
	var id = 0;
	function Deferred(init) {
		if (!(this instanceof Deferred)) {//must be called with new.
			return new Deferred(init);
		}
		this.id = ++id;
		var deferred = this;
		this._fsm = new FSM({
			state : "pending",
			statesOptions : STATES
		});

		var promise = new Promise(this);
		this.promise = function(obj) {
			if (!toolous.isDef(obj)) {
				return promise;
			} else {
				toolous.merge(obj, promise);
				//copy properties, instanceof will not work.
				return obj;
			}
		};
		
		toolous.forEachKey(Deferred.prototype, function(name,func) {
			deferred[name] = toolous.bind(func,deferred);
		});
		this.pipe = this.then;

		if (toolous.isDef(init)) {
			init.call(this, this);
		}
	}


	toolous.forEachKey(STATES, function(state, stateDefinition) {
		var fire = stateDefinition.fire, listen = stateDefinition.listen, query = stateDefinition.query;

		Deferred.prototype[listen] = function(cb) {//Add listeners
			this._fsm.on(state, cb);
			return this;
		};
		Deferred.prototype[fire] = function() {
			this[fire + "With"].apply(this, toolous.toArray(arguments, 0, this));
			return this;
		};
		Deferred.prototype[fire + "With"] = function(context) {
			this._fsm.state.apply(this._fsm, toolous.toArray(arguments, 1, state, context));
			return this;
		};

		if (query) {
			Deferred.prototype[query] = function() {
				return this._fsm.state() === state;
			};
		}
	});

	Deferred.prototype.always = function() {
		return this.done.apply(this, arguments).fail.apply(this, arguments);
	};
	Deferred.prototype.state = function() {
		return this._fsm.state();
	};
	Deferred.prototype.then = function(/*doneFilter, failFilter, progressFilter*/) {//Took some inspiration from jQuery's implementation at https://github.com/jquery/jquery/blob/master/src/deferred.js
		var args = arguments, retDeferred = new Deferred(), me = this;
		toolous.forEachKey(STATES, function(state, stateDefinition) {
			var i = stateDefinition.thenIndex,
			// fire = stateDefinition.fire,
			listen = stateDefinition.listen, filter = toolous.isFunction(args[i]) && args[i];
			me[listen](function() {
				var filterResult = filter && filter.apply(this, arguments);
				if (filterResult && toolous.isFunction(filterResult.promise)) {//a deferred object
					var filterPromise = filterResult.promise();
					toolous.forEachKey(STATES, function(_, chainStateDefinition) {
						filterPromise[chainStateDefinition.listen](retDeferred[chainStateDefinition.fire]);
					});
				} else {//value, passed along
					//if no filter pass arguments as is
					var args = [me.promise()].concat(filter ? [filterResult] : toolous.toArray(arguments)); //add context
					retDeferred[stateDefinition.fire + "With"].apply(retDeferred, args);
					
				}
			});
		});
		return retDeferred.promise();
	};

	exports.when = function() {
		var args = toolous.toArray(arguments),
			ret = new Deferred(),
			remaining = args.length,
			results = new Array(remaining),
			single, checkComplete = function() {
			if (remaining === 0) {
				ret.resolve(results);
			}
		};

		if (remaining === 1) {
			single = args[0];
			if (single !== null) {
				if ( single instanceof Deferred) {
					return single.promise();
				}
				if ( single instanceof Promise) {
					return single;
				}
			}
			return ret.resolve(single);
		}

		ret.progress(function(i, val) {//mark the ith deferred as returned.
			--remaining;
			results[i] = val;
			checkComplete();
		});
		toolous.forEach(args, function(arg, i) {
			if (toolous.isDef(arg) && arg !== null && ( arg instanceof Promise || arg instanceof Deferred)) {
				arg.done(function(value) {
					ret.notify(i, value);
				});
				arg.fail(function(args) {
					ret.reject(args);
				});
			} else {
				ret.notify(i, arg);
				//immidiate value
			}
		});

		checkComplete();
		//zero args or all immediate

		return ret.promise();
	};

	exports.Deferred = Deferred;

})( typeof exports === 'undefined' ? this.deferred = {} : exports, this);
