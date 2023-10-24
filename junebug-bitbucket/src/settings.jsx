import api, { route, storage, fetch } from "@forge/api";
import ForgeUI, { AdminPage, render, Fragment, Text, TextField, Select, Option, Form, Heading, SectionMessage, useProductContext, useState } from "@forge/ui";
import { getGPTAuthKeys, getBitbucketAuthKeys, getAPIRoute, getAvailableProjects } from "./storage"

const App = () => {
    const context = useProductContext();
    const repository = context.repository;
    const [done,setDone] = useState(false)
    const [authKey, setAuthkey] = useState(async () => await getBitbucketAuthKeys())
    const [gptAuthKey, setGptAuthkey] = useState(async () => await getGPTAuthKeys())
    const [project, setProject] = useState(async () => {
        let projectCheck = await storage.get("project")
        return projectCheck
    })

    const [projects] = useState(async () => {
        const projects = await getAvailableProjects(authKey)
        return projects
    })

    const [jiraLink,setJiraLink] = useState(async () => {
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

    async function updateDetails({ authKey, gptAuthKey,jiraUrl,selectedProject }){
        const project = projects.find(p=>p.id == selectedProject)
        await storage.set("gptAuthKey",gptAuthKey)
        await storage.set("authKey",authKey)
        await storage.set("jiraUrl",jiraUrl)
        await storage.set("project",project)
        setAuthkey(authKey)
        setGptAuthkey(gptAuthKey)
        setProject(project)
        setJiraLink(jiraUrl)
        setDone(true)
        return 
    }

    return (
        <Fragment>
            {!done?
                <SectionMessage title="Configure Auth Keys and Select a Project" appearance="info">
                    <Text>Used to communicate with JIRA and Chat GPT</Text>
                </SectionMessage>:<Fragment></Fragment>
            }
            
            <Form onSubmit={updateDetails}>
                <TextField name="authKey" label='JIRA Auth Key' defaultValue={authKey} type="password"></TextField>
                <TextField name="gptAuthKey" label='OpenAI Auth Key' defaultValue={gptAuthKey} type="password"></TextField>
                <TextField name="jiraUrl" label='JIRA Site Name' defaultValue={jiraLink}></TextField>
                <Select label="Select a Project to create JIRA in:" name="selectedProject">
                {
                    projects.map(p => <Option defaultSelected={p.id == (project || {}).id} label={p.key+"-"+p.name} value={p.id} />)
                }
                </Select>
            </Form>
            {done?(<Fragment><Heading></Heading><SectionMessage title="Updated Successfully" appearance="confirmation">
            </SectionMessage></Fragment>):(<Fragment></Fragment>)}
        </Fragment>
    );
};

export const run = render(<App />);