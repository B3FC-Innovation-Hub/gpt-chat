#!/usr/bin/env node
import ChatGPT from "./ChatGPT.js"
import * as readline from 'node:readline';
import * as process from 'node:process';
import fs from 'fs';
import path from 'node:path';
import url from 'url';

const currentDirPath = path.dirname(url.fileURLToPath(import.meta.url));

//Read a possible env file and set the values on the process.env object
const envDirs = [process.cwd(), currentDirPath, path.dirname(currentDirPath)];
for (let dir of envDirs) {
	let envPath = dir + '/.env';
	try {
		if (fs.existsSync(envPath)) {
			fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
				const [key, value] = line.split('=', 2)
				process.env[key] = value
			})
			break;
		}
	} catch (e) {
		throw new Error(`Failed to read ${envPath}`, { cause: e });
	}
}

/**
 * Make sure process.env has all required variables set, falling back on a few defaults
 * @return void
 */
function checkAllEnvExist() {
	if (!process.env.OPENAI_API_KEY) {
		console.error(`
You cannot access OpenAI's API without an API key, and none was found.

Please set the variable OPENAI_API_KEY in an .env file in one of the 
following locations:${envDirs.join('\n  ')}
or as en env variable before you call this file like so:
  OPENAI_API_KEY=<your key> ${process.argv[1]}
`);
		process.exit(2);
	}
	process.env.EOF = process.env.EOF || '\n';
	process.env.model = process.env.model || 'gpt-4'
}

//Create an interface which accepts text from the user
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});


function prompt(multiline = false, str = '') {
	if (str) process.stdout.write(str);
	
	return new Promise(async function (resolve) {
		var input = await new Promise(res => rl.question('> ', res));
		while (!multiline && !input.endsWith(process.env.EOF)) {
			input += await new Promise(res => rl.question("  ", res));
		}
		resolve(multiline ? input : input.slice(0, -1 * process.env.EOF.length));
	})
}

function parseInput(input) {
	const regex = new RegExp('"[^"]+"|[\\S]+', 'g');
	const args = [];
	for (let match of input.match(regex)) {
		if (match)
			args.push(match.replace(/"/g, ''));
	}
	const cmd = args.shift();
	return { cmd, args };
}

async function handleCommand(input, gpt) {
	const { cmd, args } = typeof input == 'string' ? parseInput(input) : input;
	switch (cmd) {
		case 'stats':
			const total = gpt.countHistoryTokens(gpt.history)
			console.log(`The converstaion contains ${gpt.history.length} turns and a total of ${total} tokens.`);
			return;
		case 'summary':
			if (gpt.summary) {
				console.log(gpt.summary); 
			} else {
				console.log("There is no summary yet. Use the command \\summarize to create one.")
			}
			return;
		case 'summarize':
			await gpt.summarize().then(console.log, console.error);
			return;
		case 'history':
			gpt.history.forEach((record, i) => { console.log(`${i}.\t${record.summary.replace('\n', '\n\t')}`) });
			return;
		case 'delete':
			var d = Number(arg[0])
			if (d) {
				d = Math.abs(d);
				console.log(`Deleting the last ${d} turns`);
				gpt.splice(-1 * d);
				//TODO: will have to update the summary
			} else {
				console.warn("The 'delete' command should be followed by the number turns to delete, eg. 1 to delete only the last turn");
			}
		case 'help':
		case 'h':
			console.info("The available commands are: stats, summary, history, delete, summarize")
			return;
		default:
			console.warn("No such cmd:", cmd, ...args); 
	}
}

function startSpinner(speed) {
	const frames = ['-', '\\', '|', '/'];
	let f = 0;
	const intervalId = setInterval(() => {
		process.stdout.write('\r' + frames[f]);
		f = (f + 1) % frames.length;
	}, speed);
	return function () { 
		clearInterval(intervalId) 
		process.stdout.write('\r')
	};
}

async function startConversation() {	
	try {
		console.log("")
		checkAllEnvExist();
		const name = process.env.USER || await prompt("Whats your name?\n> ", false);
		const gpt = new ChatGPT(process.env.OPENAI_API_KEY, name);
		console.log("Using model: " + process.env.MODEL);
		console.log("Send by " + (process.env.EOF === '\n' ? "hitting <Enter>" : ("typing: " + process.env.EOF)));
		console.log("");
		console.log(`Hi ${name}. What's on your mind?`);
		while (true) {
			const input = await prompt('',);
			if (!input) {
				continue;
			}
			if (input[0] == '\\') {
				handleCommand(input.slice(1), gpt)
			} else {
				const stopSpinner = startSpinner(100);
				const output = await gpt.chat(input, { model: process.env.MODEL });
				stopSpinner();
				console.log(output);
			}
		}
	} catch (e) {
		console.error("FATAL ERROR: ", e, "\nExiting...");
		process.exit(1)
	}
}


startConversation();
