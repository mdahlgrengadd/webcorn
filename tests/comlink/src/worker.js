import * as Comlink from "comlink";

const asyncfun = async () => {
    return "async 123";
}

const syncfun = () => {
    return "sync 123";
}

Comlink.expose({
    asyncfun,
    syncfun
})