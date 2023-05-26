/**
 * @module ChatGPT This is a wrapper around the openai npm module [library]{@link https://platform.openai.com/docs/libraries/node-js-library}  
 */

import * as openai from "openai";
import { encode } from 'gpt-3-encoder' //used to count tokens only



export class ChatGPT {

	conn = null;

  
	/**
	 * @property {object} models  Keys are model names, values are their max tokens
	 * @see Which models work with which endpoints {@link https://platform.openai.com/docs/models/model-endpoint-compatibility here}
	 */
	models = {
		'gpt-4': {      //optimized for chat, 10x cheaper than text-davinci-003, better at math, longer responses
			family: 'GPT-4'
			, token_limit: 4096
			, params: ['frequency_penalty', 'presence_penalty', 'max_tokens', 'stop', 'stream', 'n', 'top_p', 'temperature'
				, 'logit_bias', 'user']
			, method: 'createChatCompletion'
			, extractContent: body => body.messages.map(m => `${m.role}: ${m.content}\n`).join('\n')
			, extractResponse: response => response.data.choices[0].message.content.trim()
			, getFinishReason: response => response.data.choices[0].finish_reason
		}
		, 'gpt-3.5-turbo': {      //optimized for chat, 10x cheaper than text-davinci-003, better at math, longer responses
			family: 'GPT-3.5'
			, token_limit: 4096
			, usage: 'chat' 
			, params: ['frequency_penalty', 'presence_penalty', 'max_tokens', 'stop', 'stream', 'n', 'top_p', 'temperature'
				, 'logit_bias', 'user']
			, method: 'createChatCompletion'
			, extractContent: body => body.messages.map(m => `${m.role}: ${m.content}\n`).join('\n')
			, extractResponse: response => response.data.choices[0].message.content.trim()
			, getFinishReason: response => response.data.choices[0].finish_reason
		}
		, 'text-davinci-003': { //shorter responses than gpt-3.5, suitable for completion (?)
			family: 'GPT-3.5'
			, token_limit: 4096
			, usage: 'query'
			, params: ['suffix', 'frequency_penalty', 'presence_penalty', 'max_tokens', 'stop', 'stream', 'n', 'top_p'
				, 'temperature', 'logit_bias', 'logprobs', 'echo', 'best_of', 'user']
			, method: 'createCompletion'
			, extractContent: body => body.prompt
			, extractResponse: response => response.data.choices[0].text.trim()
			, getFinishReason: response => response.data.choices[0].finish_reason
		}  
		, 'davinci': { //base model (fine-tune:able), $0.02/1K tokens
			family: 'GPT-3'
			, token_limit: 2048
			, usage: 'fine-tune'
		}
		, 'curie': { //base model (fine-tune:able), faster and cheaper 10x cheaper than davinci 3.0 but not as great
			family: 'GPT-3'
			, token_limit: 2048
			, usage: 'fine-tune'

		}
		//2023-04-01: seems these may not exist anymore
		// ,'text-davinci-edit-001':{
		//   max:4096
		//   ,type:'text'
		//   ,usage:'edit'
		//   ,params:['model','input','instructions','temperature','top_p','n']
		//   ,method:'createEdit'
		// }
		// ,'code-davinci-edit-001':{
		//   max:4096
		//   ,type:'code'
		//   ,usage:'edit'
		//   ,params:['model','input','instructions','temperature','top_p','n']
		//   ,method:'createEdit'
		// }
		// ,'code-davinci-002':{max:8001,type:'code',usage:'completion',params:[]}  //suitable for code completion
	};
  


	/**
	 * @property {object} names  Used as stop tokens for model text-davinci-003 to denote who is speaking
	 */
	names = {
		user: "Human"
		, assistant: "AI"
	}

	/**
	 * @property {object} conf  The configuration sent to openai on each call. Made public via copying getter. 
	 * @see Set using this method: {@link ChatGPT#configure}
	 * @private
	 */
	#conf = {
		max_tokens: 1024,
		top_p: 1,               //0,2 - default 1, change this or temp, lower values are more deterministic
		temperature: 1,         //0,2 - default 1, change this or top_p, lower values are more deterministic
		frequency_penalty: 0.1, //-2,2 - penalize the use of the same word over and over
		presence_penalty: 0.6,  //-2,2 - similar to above... not sure difference
		stop: [` ${this.names.user}:`, ` ${this.names.assistant}:`],
		stream: false,          //resond in stream
		n: 1,
		logit_bias: null,
		logprobs: null,
		echo: false,
		best_of: 1,
		suffix: null,
	}



	/**
	 * Get the configuration for a model
	 * 
	 * @param {string} model     One of the keys from this.models
	 * @param {object} tempConf  Additional conf params which won't be stored but will be @return
	 * 
	 * @return {object}
	 */
	createBody(model, tempConf) {
		if (typeof model != 'string')
			throw new TypeError("Expected a string model name, got: " + JSON.stringify(model));
		if (!(model in this.models)) {
			if (this.engines && model in this.engines) {
				throw new Error("This custom ChatGPT class has not been configured to work with model: " + model);
			} else {
				throw new Error(`'${model}' is not an engine/model that exists on OpenAI`);
			}
		}
    
		//if a temporary conf was passed along, set it as the real conf for now as this will parse
		//and validate it. we'll revert it before exiting this function
		if (tempConf)
			var oldConf = this.configure(tempConf);


		const conf = { model };

		for (let p of this.models[model].params) {
			if (this.#conf.hasOwnProperty(p) && this.#conf[p] !== null)
				conf[p] = this.#conf[p];
		}

		if (oldConf)
			Object.assign(this.#conf, oldConf);

		return conf;
	}



	/** 
	 * @property {Array<{input:string,output:string,tokens:number,summarized:false}>} history  Array of objects containing each message and response in full.
	 */
	history = [];


	/** 
	 * @property {string} summary  A summary of the current conversation. Passed along with new prompts when the full history becomes too long 
	 */
	summary = "";

	summarize_token_cutoff = 2048
	summarize_token_target = 512

	engines = null;

	/**
	 * Setup a new instance of OpenAIApi
	 * 
	 * @param {string} apiKey    
	 * @param {string} name     Your name
	 * 
	 * @return {openai.OpenAIApi} 
	 */
	constructor(apiKey, name) {
		try {		
			//Setup a connection/instance of openai using the apiKey
			const apiConf = new openai.Configuration({
				apiKey: apiKey
			});
			this.conn = new openai.OpenAIApi(apiConf);
		} catch (cause) {
			throw new Error("Failed to create OpenAIApi instance:", { cause });
		}

		//If the user passed in a name to use, store that and use it as one of 
		//the 'stop tokens' (which I have no idea what it actually is)
		if (name) {
			this.names.user = name
			this.#conf.stop[0] = ` ${name}:`;
		}

		//Modify the history array to tally lengths of each message/response and be able to select human/ai messages
		// Object.defineProperties(this.history,{
		//   'lengths':{value:[]}
		//   ,'push':{value:
		//     function pushAndCount(str){
		//       if(typeof str!='string')
		//         throw new TypeError("Only add strings to the message history please, got: "+JSON.stringify(str));
		//       const l=Array.prototype.push.call(this,str);
		//       this.history.lengths[l-1]=str.length;
		//     }
		//   }
		//   ,'total':{value:
		//     function getTotalHistoryLength(){
		//       return this.history.lengths.reduce((tot,l)=>tot+l,0);
		//     }
		//   }
		//   ,'me':{value:function getMyQuestions(){return this.history.filter((str,i)=>i%2==0);}}
		//   ,'ai':{value:function getAiResponses(){return this.history.filter((str,i)=>i%2==1);}}
		// });

	}

	/**
	 * Connect to openai and get available models. This is a good way to make sure the api key is valid
	 *
	 * @return     {Promise}  this
	 */
	async init() {
		try {
			response = await this.conn.listEngines()
		} catch (e) {
			if ('response' in e) {
				throw new Error("Failed to init OpenAI. " + e.response.data.error.message);
			}
		}
			
		try {
			this.engines = {}
			for (let eng of response.data.data) {
				this.engines[eng.id] = eng;
			}
		} catch (cause) {
			console.error(response)
			throw new Error("Unexpected format format of list of engines (see console^)", { cause })
		}

		return this;
	}


	/**
	 * Set the configuration to be sent along to OpenAIApi. 
	 * 
	 * @see API docs {@link https://platform.openai.com/docs/api-reference/completions here}
	 * 
	 * @param {object} conf
	 * 
	 * @return {object}       The previous conf before the change
	 */
	configure(conf) {
		conf = Object.assign({}, conf); //de-couple

		const oldConf = JSON.parse(JSON.stringify(this.#conf)); //returned at bottom
    
		if (conf.max_tokens) {
			const lim = Math.max(...Object.values(this.models).map(m => m.max))
			if (conf.max_tokens > lim)
				console.error(`Cannot set max_tokens to ${conf.max_tokens} because no model exceeds the limit ${lim}`)
			else
				this.#conf.max_tokens = conf.max_tokens
			delete conf.max_tokens;
		}

		//Any remaining conf we just assign without checking
		Object.assign(this.#conf, conf);

		return oldConf;
    
	}


	#countTokens(str) {
		try {
			if (typeof str != 'string')
				throw new TypeError("Expected a string, got:" + JSON.stringify(str));
			const tokens = encode(str).length;
			if (typeof tokens != 'number' || !tokens || tokens > Math.max(...Object.values(this.models).map(m => m.token_limit)))
				throw "it produced a bad number of tokens: " + JSON.encode(tokens);
			return tokens;
		} catch (e) {
			console.error("Failed to use gpt-3-encoder:", e);
			return Math.floor(str.length / 4);
		}
	}

	/**
	 * Make sure something is a non-empty string
	 * 
	 * @param {any} text     
	 * 
	 * @throws {TypeError}      If we didn't get a string
	 * @throws {Error}          If the string is empty
	 * 
	 * @return {string}         The passed in string
	 */
	#checkNonemptyString(text) {
		if (typeof text != 'string') {
			throw new TypeError("Expected a non-empty string, got:" + JSON.stringify(text));
		}
		if (!text)
			throw new Error("Got an empty string");

		return text
	}

	/**
	 * Get a model by usage or name, or the first model listed by this.models.
	 * @param {string} usageOrName
	 */
	#getModelName(tempConf, usage) {
		//If a specific model is requested and exists, return that...
		if (tempConf && typeof tempConf == 'object' && tempConf.model) {
			if (tempConf.model in this.models) {
				// console.debug(`Using specified model: ${tempConf.model}`)
				return tempConf.model;
			}
		}

		//else return the first model with that usage
		const defaultForUsage = Object.keys(this.models).find(model => this.models[model].usage == usage);
		if (defaultForUsage) {
			// console.debug(`Using default model for ${usage}: ${defaultForUsage.name}`)
			return defaultForUsage;
		} else {
			const firstModelListed = this.models[Object.keys(this.models)[0]].name;
			console.warn(`Could not find model for '${usage}' usage, so defaulting to ${firstModelListed}`)
			return firstModelListed;
		}
		
	}

	#formatMessage(format, role, content) {
		if (format == 'chat')
			return { role, content }
		else
			return ` ${this.names[role]}: ${content}\n`
	}


	/**
	 * Get live references to the objects in this.history which have .summarized==false. 
	 * NOTE: that .summarized and .summary are different
	 * 
	 * @return {Array<object>}
	 */
	#getUnsummorizedHistory() {
		const unsummorized = []
		for (let i = this.history.length - 1; i > -1; --i) {
			if (this.history[i].summarized === false) {
				unsummorized.push(this.history[i])
			}
		}
		return unsummorized
	}
	countHistoryTokens(history) {
		var total = 0;
		for (let record of this.history) {
			total += record.input_tokens + record.output_tokens;
		}
		if (total > 1000000 || (history.length && !total)) {
			throw new Error(`Something went wrong while counting the token history. From ${history.length} turns we got ${total} tokens`);
		}
		return total
	}
	#formatHistory(format, history) {
		var formated = [];
		for (let { input, output } of history) {
			formated.push(this.#formatMessage(format, 'user', input), this.#formatMessage(format, 'assistant', output));
		}
		return formated.reverse()     
	}



	/**
	 * Chat with the AI. Your conversation will be remembered
	 * 
	 * @param {string} input       The raw text input from the user. 
	 * @param {object} tempConf    A temporary conf to use for this call
	 * 
	 * @return {Promise<string>}    The text response from the AI, ready to be console logged to show the user
	 */
	async chat(input, tempConf = {}) {
    
		this.#checkNonemptyString(input);
		const record = { input, input_tokens: this.#countTokens(input), summarized: false };

		//Get the conf for the model we'll be using, including the temporary conf if one was passed in. The conf will
		//form the basis of the api call body
		const model = this.#getModelName(tempConf, 'chat');
		const body = this.createBody(model, tempConf);

		body.messages = [{ role: 'system', content: this.summary || "You are a helpful assistant." }]
		body.messages.push(...this.#formatHistory('chat', this.#getUnsummorizedHistory()))
		body.messages.push({ role: 'user', content: input });

		//Now make the call...
		const output = await this.#makeApiCall(body)

		//...then add the response to the history
		record.output = output
		record.output_tokens = this.#countTokens(output);
		this.history.push(record)

		//Trigger some summary stuff. This happens async but we don't wait for it to finish
		this.#summarizeSingleInputOutput(input, output).then(summary => record.summary = summary).catch(console.error); //add summary to last record
		this.#summarizeConversationIfCutoffExceeded().catch(console.error); //summarize the entire conversation

    
		return output;
    
	}

	/**
	 * Ask the AI a single question. No history will be recorded so the input needs to contain everything.
	 * 
	 * @param {string} input       The raw text input from the user. 
	 * @param {object} tempConf    A temporary conf to use for this call
	 * 
	 * @return {Promise<string>}    The text response from the AI, ready to be console logged to show the user
	 */
	query(input, tempConf) {
		this.#checkNonemptyString(input);

		//Get the conf for the model we'll be using
		const model = this.#getModelName(tempConf, 'query');
		const body = this.createBody(model, tempConf);

		body.prompt = input;

		return this.#makeApiCall(body);
	}


	#adjustMaxExpectedResponseTokens(body) {
		const model = this.models[body.model];
		const tokens = this.#countTokens(model.extractContent(body))
		if (tokens > model.token_limit)
			throw new Error(`The query is too big for the model: ${tokens} vs ${model.token_limit}`);
		if (body.hasOwnProperty('max_tokens')) {
			if ((tokens + body.max_tokens) > model.token_limit) {
				body.max_tokens = model.token_limit - tokens
				console.warn("Limiting response tokens to " + body.max_tokens + " because input is too long")
			}
		}
	}

	/**
	 * Make the actual call to OpenAI. This is an internal/private method
	 * 
	 * @param {object} body        Basis of the request body
	 * 
	 * @return {Promise<string>}   The response text. Nothing has been stored anywhere
	 */
	async #makeApiCall(body) {
		const model = this.models[body.model]
		try {
      
			this.#adjustMaxExpectedResponseTokens(body);

			//Send the query
			var response = await this.conn[model.method](body);
		} catch (e) {
			if (e.response) {
				const error = e.response.data.error;
				console.error(error)
				throw new Error(`The OpenAI API call returned a ${e.response.status} ${error.type}: ${error.message}`)
			} else {
				throw new Error("Error making the OpenAI API request (see console.error(body)^)", { cause: e });
			}
		}

		//Return only the text response portion
		try {
			var output = model.extractResponse(response);
			if (!output.length)
				throw new Error(`The response was empty (at least what we extracted, ie. this could be a bug on our side)`);
			const reason = model.getFinishReason(response);
			if (reason != 'stop') {
				output += `\n[WARNING: stopped generating output because '${reason}']`
			}
			return output;
		} catch (e) {
			console.error("\n-----RESPONSE-----\n", response)
			console.error("\n-----CHOICES-----\n", response.data.choices)
			throw new Error("Problems parsing the response from openai (see full response^))", { cause: e });
		}
      
	}

	#summarizeSingleInputOutput(input, output) {
    
		const prompt = `Please summarize this question and answer in 1 sentence each. Do not add flurishes and try to keep `
			+ `it short while including the relevant information. If the question or answer is short enough just return the `
			+ `original string unaltered. Respond on 2 separate lines.`
			+ `\n\nQ: ${input}\n\nA: ${output}`;
    
		//Because we want a pretty boring summary we add some conf
		const conf = { temperature: 0.4, max_tokens: 50 };

		return this.query(prompt, conf).then(text => text.trim());
	}


	#summarizeConversationIfCutoffExceeded(force) {
		const history = this.#getUnsummorizedHistory();
		if (history.length) {
			const tokens = this.countHistoryTokens(history);
			if (force || tokens > this.summarize_token_cutoff) {
				this.summarize(history, tokens).catch(console.error)
			}
		}

	}
	async summarize(history, tokens) {
		if (!history) {
			tokens = null
			history = this.history;
		}

		tokens = tokens || this.countHistoryTokens(history);
		console.debug(`Going to summarize ${history.length} turns which together consist of ${tokens} tokens`)
   
		//Build the prompt
		var prompt = `conversation between yourself (${this.names.assistant}) and a human (${this.names.user})`
		if (this.summary)
			prompt = `Please update the following summary of a ${prompt} with the new messages which will follow.\n\nExisting summary:\n${this.summary}\n\nNew messages:\n`
		else
			prompt = `Please summarize the following ${prompt}:\n\n`

		prompt += this.#formatHistory('query', history);

		return this.query(prompt, { max_tokens: this.summarize_token_target })
			.then(summary => {
				if (summary.startsWith(this.names.assistant)) {
					summary = summary.slice(this.names.assistant.length + 1);
				}
				this.summary = summary;
				history.forEach(obj => obj.summarized = true)
				// console.debug("Summary done:\n\n",this.summary);
				return summary
			})
	}

}

export default ChatGPT