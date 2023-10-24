import api, { storage, route, fetch } from '@forge/api';
export const mimeTypes = ["text/plain", "text/html", "text/javascript", "text/x-c", "text/asp", "text/richtext", "text/xml", "application/json", "image/jpeg", "image/png"]

export async function getGPTAuthKeys() {
    const authKey = await storage.get("gptAuthKey")
    if (!authKey) {
        await storage.set("gptAuthKey", process.env.GPT_AUTH_KEY)
        return process.env.GPT_AUTH_KEY
    }
    return authKey
}

export async function getBitbucketAuthKeys() {
    const authKey = await storage.get("bitbucketAuthKey")
    if (!authKey) {
        await storage.set("bitbucketAuthKey", process.env.DEFAULT_AUTH_KEY)
        return process.env.DEFAULT_AUTH_KEY
    }
    return authKey
}

export async function getAPIRoute() {
    const apiRoute = await storage.get("apiRoute")
    if (!apiRoute) {
        await storage.set("apiRoute", process.env.API_ROUTE_INFO)
        return process.env.API_ROUTE_INFO
    }
    return apiRoute
}

export async function getRepositoryDetails(workId,repoId){
    const res = await api.asApp().requestBitbucket(route`/2.0/repositories/${workId}/${repoId}`)
    const data = await res.json()
    return data
}

export async function getAllFiles(workId,repoId){
    //TODO change this to enable paging of files for large repositories
    const res = await api.asApp().requestBitbucket(route`/2.0/repositories/${workId}/${repoId}/src?max_depth=10&pagelen=100`)
    const data = await res.json()
    return data.values
}

export async function getFileContents(workId,repositoryId,filepath){
    const res = await api
          .asApp()
          .requestBitbucket(route`/2.0/repositories/${workId}/${repositoryId}/src/master/${filepath}`);
    const contents = await res.text();
    
    return contents;
}

export async function getFileBuffer(workId,repositoryId,filepath){
    const res = await api
          .asApp()
          .requestBitbucket(route`/2.0/repositories/${workId}/${repositoryId}/src/master/${filepath}`);
    const contents = await res.arrayBuffer();
    const buffer = Buffer.from(contents)
    return buffer.toString("base64")
}

export async function getAppSettings(context){
    const forgeApp = (context.localId || "").match(/ari-cloud-ecosystem--extension-(.{8}-.{4}-.{4}-.{4}-.{12})-(.{8}-.{4}-.{4}-.{4}-.{12})/i)
    const repo = await getRepositoryDetails(context.workspaceId,context.extensionContext.repository.uuid)
    const {full_name} = repo
    const [_,forge_app,forge_key] = forgeApp
    return `https://bitbucket.org/${full_name}/admin/forge/${forge_app}/junebug-bitbucket-repo-settings`
}

export async function getAvailableProjects(authKey){
    let api_route = await getAPIRoute()
    let auth_key = authKey
    try {
        let response = await api.fetch(api_route, {
            method: "POST",
            headers: {
                "Authorization": auth_key
            },
            body: JSON.stringify({
                "command": "getProjects"
            })
        })
        const data = await response.json()
        return data
    } catch (e) {
        console.log("Error", e)
        return []
    }
}