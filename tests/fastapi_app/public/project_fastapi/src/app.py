async def app(scope, receive, send):
    print('asgi app running')
    if scope['type'] == 'lifespan':
        message = await receive()
        assert message['type'] == 'lifespan.startup'
        await send({'type': 'lifespan.startup.complete'})
        message = await receive()
        assert message['type'] == 'lifespan.shutdown'
        await send({'type': 'lifespan.shutdown.complete'})
        return
    
    if scope['type'] == 'websocket':
        await send({'type': 'websocket.close', 'code':1000})
        return
    
    if scope['type'] == 'http':
        headers = [
            (b'Content-Type', b'text/plain'),
            #('Content-Length', '14'),
        ]
        await send({
            'type': 'http.response.start',
            'status': 200,
            'headers': headers,
            })
        await send({
            'type': 'http.response.body',
            'body': b'Hello ',
            'more_body': True,
        })
        await send({
            'type': 'http.response.body',
            'body': b'Webcorn from fastapi!',
            'more_body': True,
        })
        await send({
            'type': 'http.response.body',
            'body': b'',
        })
        return

is_wsgi = False