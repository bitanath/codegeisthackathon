import Resolver from "@forge/resolver";
import { Queue } from '@forge/events';
import api, { route, storage, fetch } from "@forge/api";

import { getAllFiles, getFileContents, getFileBuffer, mimeTypes, getGPTAuthKeys, getAPIRoute } from "./storage"

const resolver = new Resolver();
const queue = new Queue({ key: 'junebug-queue' });

resolver.define("event-listener", async ({ payload, context }) => {
    let {mimetype,path,escaped_path,size,workId,repoId} = payload
    if(/image/i.test(mimetype)){
        //TODO handle image separately, test for faces and PII
        const contents = await getFileBuffer(workId,repoId,path) //this is a base64 string
        const {hasPII,redacted} = await callCloudFunction(contents,path)
        if(hasPII && !!redacted){
          let file = {}
          file.description = "Image needs to be obfuscated because it has PII text or faces."
          file.summary = `Image in ${path} has PII issues`
          file.jira = undefined
          file.type = "image" //can be either code or image
          file.path = path
          file.workId = workId
          file.repoId = repoId
          // file.base64 = redacted
          let files = await storage.get("files")
          files = files || []
          files.push(file)
          await storage.set("files",files)
        }
    }else if (!/gitignore|-lock|\.md/i.test(path)){
        const contents = await getFileContents(workId,repoId,path)
        const prompt = generatePrompt(contents)
        const response = await callOpenAI(prompt)
  
        let lines = response.split("\n")
        let first = lines.shift()
        if(/yes|exhibits|has/i.test(first)){
            //TODO vulnerability detected, store this
            let file = {}
            file.description = lines.join("\n") //all but the first line
            if(/`.*?`/ig.test(file.description) && (file.description.match(/`.*?`/ig)[0]||"").length > 2){
                file.summary = `Security vulnerability detected for ${(file.description.match(/`.*?`/ig)||[])[0] || ""} in ${escaped_path}`
            }else{
                file.summary = `Code in ${escaped_path} has a security vulnerability`
            }
            
            file.jira = undefined
            file.type = "code" //can be either code or image
            file.path = path
            file.escpath = escaped_path
            file.workId = workId
            file.repoId = repoId
            let files = await storage.get("files")
            files = files || []
            files.push(file)
            console.log("Storing file ",file)
            await storage.set("files",files)
        }
    }
});

export async function refreshFiles(workId,repoId){
    let files = await getAllFiles(workId, repoId)
    let checkFiles = await storage.get("files")
    checkFiles = checkFiles || []
    
    
    files = files.filter(e => e.type == "commit_file").filter(e=>!checkFiles.map(a=>a.path).includes(e.path)).map(e=>{
        let {mimetype,path,escaped_path,size} = e
        return {mimetype,path,escaped_path,size,workId,repoId}
    })
    const gptContext = files.find(e=>/gpt\.context/i.test(e.path))

    if(!!gptContext){
        files = files.filter(item => item !== gptContext)
        let gptContents = await getFileContents(workId,repoId,gptContext.path)
        
        let gptArray = gptContents.split("\n").filter(e=>!/^#.*?/ig.test(e))
        files = files.filter(e=>!gptArray.includes(e.path))
    }

    if(files.length >= 1){
        let jobId = await queue.push(files.slice(0,50),{delayInSeconds:10})
    }
}

function generatePrompt(contents){
    let start = "Does the below code have any security issues or vulnerabilities. Start your answer with Yes if there is a security issue or security vulnerability. Provide details of any issue or vulnerability:\n"
    let mid = contents
    let end = start + "\n" + mid
    return end
}

export async function callCloudFunction(img){
  let url = await storage.get("cloudFunction")
  let apiKey = await getGPTAuthKeys()
  url = url || process.env.CLOUD_FUNCTION_URL
  const options = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    redirect: 'follow',
    body: JSON.stringify({
      "image": img
    })
  }
  let response = await api.fetch(url,options)
  let json = await response.json()
  const {hasPII,redacted} = json
  console.log("Got has pii",hasPII)
  return {hasPII,redacted}
}

async function callOpenAI(prompt){
    const choiceCount = 1;
    const url = `https://api.openai.com/v1/chat/completions`;
    const payload = {
      model: 'gpt-3.5-turbo',
      n: choiceCount,
      messages: [{
        role: 'user',
        content: prompt
      }]
    };
    let apiKey = await getGPTAuthKeys()
    const options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      redirect: 'follow',
      body: JSON.stringify(payload)
    };

    const response = await api.fetch(url, options);
    let result = ''
  
    if (response.status === 200) {
      const chatCompletion = await response.json();
      const firstChoice = chatCompletion.choices[0]
  
      if (firstChoice) {
        result = firstChoice.message.content;
      } else {
        console.warn(`Chat completion response did not include any assistance choices.`);
        result = `AI response did not include any choices.`;
      }
    } else {
      const text = await response.text();
      result = text;
    }
    return result;
}

export const handler = resolver.getDefinitions();