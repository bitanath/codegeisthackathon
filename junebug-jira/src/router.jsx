
import api, { route, storage, fetch } from "@forge/api";
import FormData from "form-data";


/**
 * 
 * @returns - Note max results at 1000 is a hack to get all projects in 1 call
 */
async function getIssuesFromKeys(keys){
    let joinedKeys = keys.map(k=>'"'+k+'"').join(",")
    // let escapedQuery = encodeURIComponent(`issuekey IN (${joinedKeys})`)
    let escapedQuery = `issuekey IN (${joinedKeys})`
    const res = await api.asApp().requestJira(route`/rest/api/3/search?jql=${escapedQuery}`,{method:"GET"})
    
    const data = await res.json()
    let fields = (data.issues || []).map(e=>{
        let {fields,key} = e
        fields = fields || {}
        let {status,priority,progress,votes,assignee} = fields
        status = (status || {}).name
        priority = (priority || {}).name
        progress = (progress || {}).progress
        votes = (votes || {}).votes
        return {status,priority,progress,votes,assignee,key}
    })
    return fields
}

/**
 * 
 * @returns - Note max results at 1000 is a hack to get all projects in 1 call
 */
async function getProjects(){
    const res = await api.asApp().requestJira(route`/rest/api/3/project/search?maxResults=1000`,{
        headers: {
            'Accept': 'application/json'
          }
    })
    
    const data = await res.json()
    const projects = (data || {}).values.map(prj=>{
        const {id,key,name,projectTypeKey} = prj
        const type = projectTypeKey
        return {id,key,name,type}
    })
    return projects
}

/**
 * 
 * @returns - Gets workspace string
 */
async function getWorkspaceUrl(){
    const res = await api.asApp().requestJira(route`/rest/api/3/serverInfo`,{
        headers: {
            'Accept': 'application/json'
          }
    })
    
    const data = await res.json()
    const {baseUrl} = data
    return baseUrl
}

/**
 * 
 * @param {*} summary 
 * @param {*} description 
 * @param {*} projectKey 
 * @returns - A Slightly finicky function that expects description to be JSON of the format below
 */
async function createIssue(summary,description,projectKey){
    const issueType = "Bug" //NOTE all issues created this way are bugs, Chat GPT only finds faults
    const descr = {
        "type": "doc",
        "version": 1,
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": description
              }
            ]
          }
        ]
    }
    
    const body = { "fields": { "project": { "key": projectKey }, "summary": summary, "description": descr, "issuetype": { "name": issueType }} }
    const res = await api.asApp().requestJira(route`/rest/api/3/issue?updateHistory=true`,{
        method: "POST",
        headers: {
            'Accept': 'application/json'
        },
        body: JSON.stringify(body)
    })
    const {id,key,self}  = await res.json()
    return {id,key,self} 
}

/**
 * 
 * @param {*} summary 
 * @param {*} description 
 * @param {*} projectKey 
 * @param {*} files - array of b64 encoded attachments returned from whatever
 * @returns - Note this is a very finicky function and requires buffer -> form data with filename -> headers to be set
 */
async function createIssueWithAttachments(summary,description,projectKey,files){
    const issue = await createIssue(summary,description,projectKey)
    let results = []
    for await (const file of files) {
        const form = new FormData();
        const buffer = await Buffer.from(file.replace(/^data:([A-Za-z-+\/]+);base64,/i,""),"base64") //NOTE assumed file is base64 encoded string
        
        //HACK form data need to have filename, known length and a buffer
        form.append('file', buffer,{knownLength: Buffer.byteLength(buffer),filename:(Math.random()*10000).toFixed()+".jpg"});
        const headers = form.getHeaders()
        
        const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issue.key}/attachments`,{
            method: "POST",
            headers: {
                'content-type': headers["content-type"], //HACK need boundary that's only found from form header
                'X-Atlassian-Token':'no-check', //XXX need this also
                'Accept': 'application/json'
            },
            body: form.getBuffer()
        })
        const result = await res.json()
        const [{content,created,id,mimeType,thumbnail,self,filename}] = result
        results.push({content,created,id,mimeType,thumbnail,self,filename})
    }
    const {id,key,self} = issue //FIX return issue details instead off attachment details
    return {id,key,self}
}

export async function run(req, context) {
    try {
        const method = req.method
        const authKeyReceived = req.headers["authorization"][0]

        const body = JSON.parse(req.body);
        const keys = body.keys
        const projectKey = body.projectKey
        const command = body.command
        const files = body.files //TODO an array of files to attach
        const summary = body.summary
        const description = body.description //fields required to create a JIRA

        let authKeyCheck = await storage.get("authKey")
        if (!authKeyCheck) {
            authKeyCheck = process.env.DEFAULT_AUTH_KEY //default auth key the app is installed with
        }

        if (!(method == "POST" || method == "post")) {
            throw new Error("HTTP method not supported")
        }

        if (authKeyReceived != authKeyCheck) {
            throw new Error("Unauthorized from app")
        }
        let result = undefined
        
        switch (command) {
            case "getProjects":
                result = await getProjects()
                break
            case "getWorkspaceUrl":
                result = await getWorkspaceUrl()
                break
            case "getIssuesFromKeys":
                if (!keys){
                    throw new Error("Issue keys need to be specified")
                }
                result = await getIssuesFromKeys(keys)
                break
            case "createIssue":
                if (!projectKey || !summary || !description){
                    throw new Error("Issue needs to have summary and description specified")
                }
                result = await createIssue(summary,description,projectKey)
                break
            case "createIssueWithAttachment":
                if (!projectKey || !summary || !description || !files){
                    throw new Error("Issue needs to have summary, description and files specified")
                }
                result = await createIssueWithAttachments(summary,description,projectKey,files)
                break
        }

        if (!result) {
            throw new Error("Unable to get a result of the operation")
        }

        return {
            body: JSON.stringify(result),
            headers: { "Content-Type": ["application/json"] },
            statusCode: 200,
            statusText: "OK",
        };
    } catch (error) {
        console.log("Caught erroor ", error)
        return {
            body: JSON.stringify(error) + "\n",
            headers: { "Content-Type": ["application/json"] },
            statusCode: 400,
            statusText: "Bad Request",
        }
    }
}
