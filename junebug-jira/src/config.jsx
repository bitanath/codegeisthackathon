import api, { route, storage, fetch } from "@forge/api";
import ForgeUI, { AdminPage, render, Fragment, Text, TextField, Select, Option, Form, Heading, SectionMessage, useProductContext, useState } from "@forge/ui";

const App = () => {
    const context = useProductContext();

    const [authKey,setAuthkey] = useState(async ()=>{
        let authKeyCheck = await storage.get("authKey")
        if (!authKeyCheck) {
            authKeyCheck = process.env.DEFAULT_AUTH_KEY //default auth key the app is installed with
        }
        return authKeyCheck
    })
    const [priority,setPriority] = useState(async ()=>{
        let priorityCheck = await storage.get("priority")
        if(!priorityCheck){
            const res = await api.asApp().requestJira(route`/rest/api/3/priority/search?maxResults=1000`)
            const data = await res.json()
            return data.values[0]
        }
        return priorityCheck
    })
    const [priorities] = useState(async ()=>{
        const res = await api.asApp().requestJira(route`/rest/api/3/priority/search?maxResults=1000`)
        const data = await res.json()
        return data.values
    })
    const [done,setDone] = useState(false)

    async function updateDetails({ authKey, selectedPriority }){
        const priority = priorities.find(p=>p.id == selectedPriority)
        await storage.set("priority",priority)
        await storage.set("authKey",authKey)
        setAuthkey(authKey)
        setPriority(priority)
        setDone(true)
        return 
    }

    return (
        <Fragment>
            {!done?
                <SectionMessage title="Configure Auth Key and Priority" appearance="info">
                    <Text>Used for Junebug for Bitbucket generated AI issues</Text>
                </SectionMessage>:<Fragment></Fragment>
            }
            
            <Form onSubmit={updateDetails}>
                <TextField name="authKey" label='Authorization Key' defaultValue={authKey} type="password"></TextField>
                <Select label="Default Priority for AI generated issues" name="selectedPriority">
                {
                    priorities.map(p => <Option defaultSelected={p.id == (priority || {}).id} label={p.name} value={p.id} />)
                }
                </Select>
            </Form>
            {done?(<Fragment><Heading></Heading><SectionMessage title="Updated" appearance="confirmation">
            </SectionMessage></Fragment>):(<Fragment></Fragment>)}
        </Fragment>
    );
};

export const run = render(<AdminPage><App /></AdminPage>);