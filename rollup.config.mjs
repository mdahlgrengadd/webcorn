import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default [
    {
        input: 'build/server.js',
        output: [
            {
                file: 'dist/server.mjs',
                format: 'esm'
            },
            {
                name: 'Webcorn',
                file: 'dist/server.js',
                format: 'umd'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
        ]
    },
    {
        input: 'src/service-worker.js',
        output: [
            {
                file: 'dist/service-worker.mjs',
                format: 'esm'
            },
            {
                name: "Webcorn",
                file: 'dist/service-worker.js',
                format: 'umd'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
        ]
    }
];