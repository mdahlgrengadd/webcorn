import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default [
    {
        input: 'src/main.js',
        output: [
            {
                file: 'dist/main.js',
                format: 'iife'
            },
        ],
        plugins: [
            commonjs(),
        ]
    },
    {
        input: 'src/service-worker.js',
        output: {
            file: 'dist/service-worker.mjs',
            format: 'es'
        },
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
    }
];