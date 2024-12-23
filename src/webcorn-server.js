console.log("webcorn-server started.");
navigator.serviceWorker.addEventListener('message', (event) => {
    console.log(event);
});