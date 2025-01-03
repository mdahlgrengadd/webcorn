import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default [
    {
        input: 'src/server.js',
        output: [
            {
                file: 'dist/server/index.mjs',
                format: 'es'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
            copy({
                targets: [
                    {src: 'public/style.css', dest: 'dist'},
                    {src: 'public/server', dest: 'dist'},
                ]
            }),
        ]
    },
    {
        input: 'src/worker.js',
        output: [
            {
                file: 'dist/server/worker.mjs',
                format: 'es'
            },
        ],
        external: ['./pyodide.mjs', './pyodide.asm.js'],
        plugins: [
            resolve(),
            commonjs(),
            copy({
                targets: [
                    {src: 'node_modules/pyodide/pyodide*', dest: 'dist/server'},
                    {src: 'node_modules/pyodide/python_stdlib.zip', dest: 'dist/server'},
                ]
            }),
        ]
    },
    {
        input: 'src/service-worker.js',
        output: {
            file: 'dist/service-worker.mjs',
            format: 'es'
        },
        plugins: [
            resolve(),
            commonjs(),
        ]
    }
];