import api, { route, storage, fetch } from "@forge/api";
import ForgeUI, { render, Fragment, Text, Em, Heading, Table, Link, Row, Cell, Head, Tooltip, useProductContext, useState } from "@forge/ui";
import {getBitbucketAuthKeys,getAPIRoute} from "./storage"


const App = () => {
    const context = useProductContext()
    const [project, setProject] = useState(async () => {
        let projectCheck = await storage.get("project")
        return projectCheck
    })

    const [files] = useState(async () => {
        const workId = context.workspaceId
        const repoId = context.extensionContext.repository.uuid
        let existingFiles = await storage.get("files")
        existingFiles = existingFiles.filter(f=>f.workId == workId && f.repoId == repoId && !!f.jira)
        let jiraKeys = existingFiles.map(f=>f.jira.key)
        const api_route = await getAPIRoute()
        const auth_key = await getBitbucketAuthKeys()
        let response = await api.fetch(api_route, {
            method: "POST",
            headers: {
                "Authorization": auth_key
            },
            body: JSON.stringify({
                "command": "getIssuesFromKeys",
                "keys": jiraKeys
            })
        })
        let statuses = await response.json()
        statuses = (statuses || []).map(s=>{
            const {key,status,priority,progress,votes, assignee} = s
            let file = existingFiles.find(f=>f.jira.key == key)
            file.key = key
            file.status = status
            file.priority = priority || "Low"
            file.progress = progress || 0
            file.votes = votes || 0
            file.assignee = assignee || "No One"
            file.description = file.description.replace(/^\n?.*?1\.\s+/i,"")
            file.shortDescription = file.description.replace(/^\n?.*?1\.\s+/i,"").slice(0,50) + "..."
            return file
        })
        
        return statuses
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
    
    function getLinkFromKey(key){
        return `${jiraLink}/browse/${key}`
    }

    function renderTable(){
        return (<Fragment>
            <Heading size="small">ℹ List of all JIRA issues created using Junebug</Heading>
            <Table>
                <Head>
                    <Cell>
                        <Text>File</Text>
                    </Cell>
                    <Cell>
                        <Text>Issue</Text>
                    </Cell>
                    <Cell>
                        <Text>Description</Text>
                    </Cell>
                    <Cell>
                        <Text>Status</Text>
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
                        <Cell>
                            <Tooltip text={file.description}><Text>{file.shortDescription}</Text></Tooltip>
                        </Cell>
                        <Cell>
                            <Text>{file.status}</Text>
                        </Cell>
                        <Cell><Text><Link href={getLinkFromKey(file.key)} openNewTab>{file.key}</Link> </Text>
                        </Cell>
                    </Row>)
                }
            </Table>
        </Fragment>)
    }

    return (
        <Fragment>
            {!project?
            <Text>Uh Oh! You don't have a JIRA project setup. Set one up <Link href={appLink}>Here</Link></Text>
        :renderTable()} 
        </Fragment>
    );
};

export const run = render(<App />);