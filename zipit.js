import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const dozip = (dir) => {
    const base = path.basename(dir);
    const dst = `dist/${base}.zip`;
    const output = fs.createWriteStream(dst);
    const archive = archiver('zip', {zlib: {level: 9}});
    output.on('close', () => {
        console.log(`created ${dst}, ${archive.pointer()} total bytes`);
    });
    archive.on('error', err => {
        throw err;
    });

    archive.pipe(output);

    archive.directory(dir, base);
    archive.finalize();
}

dozip('public/project_django');
dozip('public/project_flask');
dozip('public/project_fastapi');