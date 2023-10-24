import api, { route, storage, fetch } from "@forge/api";

import { refreshFiles } from "./queue";

export async function run(event,context){
    console.log("Got commit",event)
    console.log("Got commit",context)
}