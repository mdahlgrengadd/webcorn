import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default [
    {
        input: 'src/webcorn.js',
        output: [
            {
                file: 'dist/webcorn.mjs',
                format: 'es'
            },
        ],
        external: ['./pyodide.mjs', './pyodide.asm.js'],
        plugins: [
            resolve(),
            commonjs(),
            copy({
                targets: [
                    {src: 'node_modules/pyodide/pyodide*', dest: 'dist'},
                    {src: 'node_modules/pyodide/python_stdlib.zip', dest: 'dist'},
                    {src: 'public/*.*', dest: 'dist'},
                ]
            }),
        ]
    },
    {
        input: 'src/service-worker.js',
        output: {
            file: 'dist/webcorn/service-worker.mjs',
            format: 'es'
        },
        plugins: [
            resolve(),
            commonjs(),
        ]
    }
];