import fs from 'fs';

// 要替换的字符串
const placeholder = '{WORKER.CODE}';

// 读取要替换的内容的文件
fs.readFile('build/worker.mjs', 'utf8', (err, data) => {
    if (err) {
        console.error('读取源文件时出错:', err);
        return;
    }

    const code = data.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

    // 读取目标文件
    fs.readFile('src/server.js', 'utf8', (err, targetData) => {
        if (err) {
            console.error('读取目标文件时出错:', err);
            return;
        }

        // 替换目标文件中的指定字符串
        const updatedData = targetData.replace(placeholder, code);

        // 将更新后的内容写回目标文件
        fs.writeFile('build/server.js', updatedData, 'utf8', (err) => {
            if (err) {
                console.error('写入目标文件时出错:', err);
                return;
            }
            console.log('替换完成！');
        });
    });
});