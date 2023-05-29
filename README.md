# OpenAI GPT Chat API Wrapper

This is a wrapper around OpenAI's GPT Chat API which can be included in web-projects or invoked directly from the command line.

This project is part of B3 Consulting Group's Innovation Hub.

## TODO
- [ ] Setup npm org and push to it npm
- [ ] Port to typescript

## Installation
2023-05-29: Not yet implemented! Until npm package is deployed you will have do download the source files and use './src/bin/cli.js' where you would otherwise use 'gpt-chat'.

```bash
$ npm install -g @b3fc/gpt-chat
```
By installing it globally you'll be able to invoke it directly from the command line, see below.

## Usage

You can use this directly from the command line which will give you an interactive terminal interface, just run:
```bash
$ OPENAI_API_KEY=asdfjasldjf MODEL=gpt-4 gpt-chat
```
or
```bash
$ echo 'OPENAI_API_KEY=asdfjasldjf' > .env
$ echo 'MODEL=gpt-4' >> .env 
$ gpt-chat
```

Or you can use it as a library in your own project, for example:
```javascript
import ChatGPT from '@b3fc/gpt-chat';
const gpt=new ChatGPT(OPENAI_API_KEY, YOUR_NAME);
gpt.init().then(()=>gpt.chat('what is the meaning of life', { model:'gpt-4' })).then(console.log).catch(console.error);
```

## Development
When developing this package it may behoove you to use Chrome's DevTools to see what's going on, it that case:
1. Open Chrome and go to 'chrome://inspect'
2. Click 'Open dedicated DevTools for Node' (a blue link in the middle of the screen)
3. Open terminal and run `cd path/to/gpt-chat; npm run debug`

