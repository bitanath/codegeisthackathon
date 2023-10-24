import api, { route, storage, fetch } from "@forge/api";

import ForgeUI, { render, Fragment, Text, Em, Strong, Heading, Code, Table, Link, Row, Cell, Head, Button, useProductContext, useState } from "@forge/ui";
import { getRepositoryDetails, getAppSettings, mimeTypes, getAPIRoute, getBitbucketAuthKeys, getFileContents, getFileBuffer } from "./storage"
import { refreshFiles, callCloudFunction } from "./queue";

const App = () => {
    const context = useProductContext()
    const [project, setProject] = useState(async () => {
        let projectCheck = await storage.get("project")
        return projectCheck
    })
    const [files, setFiles] = useState(async () => {
        const workId = context.workspaceId
        const repoId = context.extensionContext.repository.uuid
        let existingFiles = await storage.get("files")
        storage.set("files",existingFiles)
        existingFiles = existingFiles.filter(f=>f.workId == workId && f.repoId == repoId)
        await refreshFiles(workId,repoId) //kick off file refresh in background queue
        return existingFiles || []
    })

    const [jiraLink] = useState(async () => {
        const jiraLink = await storage.get("jiraLink")
        if(!jiraLink){
            const api_route = await getAPIRoute()
            const auth_key = await getBitbucketAuthKeys()
            let response = await api.fetch(api_route, {
                method: "POST",
                headers: {
                    "Authorization": auth_key
                },
                body: JSON.stringify({
                    "command": "getWorkspaceUrl"
                })
            })
            let url = await response.json()
            if(!!url){
                await storage.set("jiraLink",url)
            }
            return url
        }
        return jiraLink
    })

    const [appLink] = useState(async () => {
        const link = await getAppSettings(context)
        return link
    })

    function getLinkFromKey(key){
        return `${jiraLink}/browse/${key}`
    }

    async function createCommit(file,issueKey){
        const workId = context.workspaceId
        const repoId = context.extensionContext.repository.uuid
        if(/image/ig.test(file.mimetype)){
            return
        }
        let contents = await getFileContents(workId,repoId,file.path)
        contents = encodeURIComponent(contents + "\r\n")
        const message = encodeURIComponent(`${issueKey} identified security issues`)
        const name = encodeURIComponent(file.path)
        const res = await api
              .asApp()
              .requestBitbucket(route`/2.0/repositories/${workId}/${repoId}/src`,{
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded"
                },
                body: `${name}=${contents}&message=${message}`
        })
        const data = await res.text();
        console.log("Committed file ",data)
        return data;
              
      }

    async function createIssue(file){
        const projectKey = project.key
        const {summary,description} = file
        console.log("Now to create a JIRA using ",projectKey,summary,description)
        const api_route = await getAPIRoute()
        const auth_key = await getBitbucketAuthKeys()
        try {
            let response = await api.fetch(api_route, {
                method: "POST",
                headers: {
                    "Authorization": auth_key
                },
                body: JSON.stringify({
                    "command": "createIssue",
                    "projectKey": projectKey,
                    "summary":summary,
                    "description":description
                })
            })
            const data = await response.json() //has a link to the issue as well as id
            const {id,key,self} = data
            let feel = file
            feel.jira = {id,key,link:self} 
            const index = files.findIndex(f=>file.path == f.path)
            files[index] = feel
            await setFiles(files)
            await storage.set("files",files)
            await createCommit(file,key)
        } catch (e) {
            console.log("Error", e)
            return []
        }
    }

    async function createIssueWithAttachment(file){
        const projectKey = project.key
        const workId = context.workspaceId
        const repoId = context.extensionContext.repository.uuid
        const {summary,description,path} = file
        const contents = await getFileBuffer(workId,repoId,path)
        const {hasPII,redacted} = await callCloudFunction(contents)
        if(!hasPII){
            return
        }
        const api_route = await getAPIRoute()
        const auth_key = await getBitbucketAuthKeys()
        try {
            let response = await api.fetch(api_route, {
                method: "POST",
                headers: {
                    "Authorization": auth_key
                },
                body: JSON.stringify({
                    "command": "createIssueWithAttachment",
                    "projectKey": projectKey,
                    "summary":summary,
                    "description":description,
                    "files": [contents,redacted]
                })
            })
            const data = await response.json() //has a link to the issue as well as id
            const {id,key,self} = data
            console.log("Created JIRA ",id,key,self)
            let feel = file
            feel.jira = {id,key,link:self} 
            const index = files.findIndex(f=>file.path == f.path)
            files[index] = feel
            await setFiles(files)
            await storage.set("files",files)
        } catch (e) {
            console.log("Error", e)
            return []
        }
    }

    function renderFilesWithIssues(files) {
        return <Fragment>
            <Heading size="small">ℹ Click the refresh button to diagnose more issues</Heading>
            <Button onClick={async ()=>{
                const files = await storage.get("files")
                await setFiles(files)}} text="Refresh" icon="refresh" iconPosition="after"></Button>
            <Table>
                <Head>
                    <Cell>
                        <Text>File</Text>
                    </Cell>
                    <Cell>
                        <Text>Issue</Text>
                    </Cell>
                    <Cell>
                        <Text>JIRA</Text>
                    </Cell>
                </Head>
                {
                    files.map(file=><Row>
                        <Cell>
                            <Text><Em>{file.path}</Em></Text>
                        </Cell>
                        <Cell>
                            <Text>{file.summary}</Text>
                        </Cell>
                        <Cell>{!file.jira?<Button text="Create" onClick={async ()=>{file.type == "code" ? await createIssue(file) : await createIssueWithAttachment(file)}} appearance="warning" icon="open" iconPosition="after"></Button>
                            :<Text><Link href={getLinkFromKey(file.jira.key)} openNewTab>{file.jira.key}</Link></Text>
                            }
                            
                        </Cell>
                    </Row>)
                }
            </Table>
        </Fragment>
    }

    return (
        <Fragment>
            {!project ?
                <Text>Uh Oh! You don't have a JIRA project setup. Set one up <Link href={appLink}>Here</Link></Text>
                : files.length < 1 ? <Button onClick={async ()=>{
                    const files = await storage.get("files")
                    await setFiles(files)}} text="Refresh to see scanned files" appearance="subtle" icon="refresh" iconPosition="after"></Button>: renderFilesWithIssues(files)}
        </Fragment>
    );
};

export const run = render(<App />);

export async function commited(event,context){
    console.log("Repository updated now refresh list")
}