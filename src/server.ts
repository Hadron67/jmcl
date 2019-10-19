import { createServer, Socket } from 'net';

interface PipeServer {
    write(d: string): void;
    listen(port: number): void;
    stop(cb: (e: any) => any): void;
};

export function createPipeServer(): PipeServer {
    let connections: Socket[] = [];
    function addConnection(s: Socket){
        for (let i = 0; i < connections.length; i++){
            if (connections[i] === null){
                connections[i] = s;
                return;
            }
        }
        connections.push(s);
    }
    function write(s: string){
        for (const c of connections){
            c && c.write(s);
        }
    }
    const server = createServer(s => {
        addConnection(s);
        s.on('close', err => {
            connections[connections.indexOf(s)] = null;
        });
    });

    return {
        write,
        listen: port => server.listen(port, '127.0.0.1'),
        stop(cb){
            for (const c of connections){
                c && c.end();
            }
            server.close(err => cb(err));
        }
    };
}