import React, { useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Download, BookOpen, Bot, FileText, CheckCircle2, ChevronRight, FileArchive } from 'lucide-react';
import { pluginFiles } from './lib/plugin-source';
import { cn } from './lib/utils';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [activeFile, setActiveFile] = useState<string>('main.ts');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("obsidian-llm-wiki-agent");
      
      if (folder) {
        Object.entries(pluginFiles).forEach(([filename, content]) => {
          folder.file(filename, content);
        });
        
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "obsidian-llm-wiki-agent.zip");
      }
    } catch (e) {
      console.error("Failed to generate zip", e);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f3ee] text-[#333d29] font-['Helvetica_Neue',Helvetica,Arial,sans-serif] selection:bg-[#e9edc9]">
      {/* Header */}
      <header className="bg-[#efede8] border-b border-[#d4d1c9] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#6b705c]" />
            <h1 className="font-bold text-lg tracking-tight">Karpathy 知识库智能代理</h1>
          </div>
          <button 
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-2 bg-[#6b705c] hover:bg-[#a5a58d] text-white px-4 py-2 rounded-md font-bold text-sm transition-colors shadow-sm disabled:opacity-70"
          >
            {isDownloading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FileArchive className="w-4 h-4" />
            )}
            下载本地插件
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left Column: Instructions & Info */}
          <div className="lg:col-span-5 space-y-10">
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-4 text-[#333d29]">
                你的持续性个人知识库维护者
              </h2>
              <p className="text-[#6b705c] leading-relaxed text-lg">
                基于 Andrej Karpathy 的 LLM Wiki 方法论，这款 Obsidian 插件建立在你的原始资料之上，由大语言模型全自动为你维护结构化、互相链接的 Markdown 知识库。
              </p>
            </div>

            <div className="space-y-6">
              <div className="bg-[#ffffff] border border-[#d4d1c9] rounded-xl p-6 shadow-sm">
                <h3 className="font-bold flex items-center justify-between text-[#6b705c] text-[11px] uppercase tracking-[0.1em] mb-4">
                  <span className="flex items-center gap-2"><Bot className="w-4 h-4 text-[#6b705c]" /> 核心功能</span>
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 bg-[#faf9f6] border border-[#d4d1c9] p-3 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-[#a5a58d] mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold text-sm text-[#333d29] mb-1">吸收原始资料 (Ingest)</div>
                      <div className="text-[#6b705c] text-xs leading-relaxed">大语言模型将阅读你的散乱笔记，自动提取关键实体、更新全局索引，并为你创建相互链接的结构化概念页面。</div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 bg-[#faf9f6] border border-[#d4d1c9] p-3 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-[#a5a58d] mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold text-sm text-[#333d29] mb-1">智能对话检索 (Smart Queries)</div>
                      <div className="text-[#6b705c] text-xs leading-relaxed">在代理侧边栏中进行提问。它会自动搜索索引、深入阅读相关笔记页面，并结合可靠的引用链接来综合回答你的问题。</div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 bg-[#faf9f6] border border-[#d4d1c9] p-3 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-[#a5a58d] mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold text-sm text-[#333d29] mb-1">知识库健康评估 (Wiki Linting)</div>
                      <div className="text-[#6b705c] text-xs leading-relaxed">定期对你的个人知识库进行健康状态分析，排查自相矛盾的内容、孤立页面流失，并主动为你查漏补缺建议建立新的链接点。</div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 bg-[#faf9f6] border border-[#d4d1c9] p-3 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-[#a5a58d] mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold text-sm text-[#333d29] mb-1">自定义与本地大模型支持 (Local API)</div>
                      <div className="text-[#6b705c] text-xs leading-relaxed">内置兼容了 OpenAI 格式接口。不只是公有云 Gemini/OpenAI，你甚至可以一键切换连接到本地的 Ollama 或者 LM Studio 脱机运行。</div>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="bg-[#ffffff] border border-[#d4d1c9] rounded-xl p-6 shadow-sm">
                <h3 className="font-bold flex items-center justify-between text-[#6b705c] text-[11px] uppercase tracking-[0.1em] mb-4">
                  <span className="flex items-center gap-2"><Download className="w-4 h-4 text-[#6b705c]" /> 本地安装指南</span>
                </h3>
                <ol className="space-y-3 text-xs text-[#555] list-decimal list-outside ml-4 border-l-2 border-[#a5a58d] pl-4">
                  <li className="pl-1">点击右上方的 <strong className="text-[#333d29]">下载本地插件</strong> 按钮获取压缩包。</li>
                  <li className="pl-1">将解压后的文件夹放入你的 Obsidian 知识库 <code className="bg-[#f0ead2] text-[#333d29] px-1.5 py-0.5 rounded font-['Courier_New',Courier,monospace] font-bold">.obsidian/plugins/</code> 目录中。</li>
                  <li className="pl-1">在该文件夹内打开终端命令行，运行 <code className="bg-[#f0ead2] text-[#333d29] px-1.5 py-0.5 rounded font-['Courier_New',Courier,monospace] font-bold">npm install && npm run build</code>。</li>
                  <li className="pl-1">重新启动 Obsidian 软件，并在“第三方插件”设置中启用 <strong className="text-[#333d29]">LLM Wiki Agent</strong> 插件。</li>
                  <li className="pl-1">进入该插件设置，填写你的 Gemini API Key 即可启动大模型。</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Right Column: Code Viewer */}
          <div className="lg:col-span-7">
            <div className="bg-[#ffffff] border border-[#d4d1c9] rounded-xl shadow-sm overflow-hidden flex flex-col h-[700px]">
              <div className="flex items-center gap-1 bg-[#efede8] border-b border-[#d4d1c9] px-2 py-2 overflow-x-auto">
                {Object.keys(pluginFiles).map((filename) => (
                  <button
                    key={filename}
                    onClick={() => setActiveFile(filename)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md whitespace-nowrap transition-colors",
                      activeFile === filename 
                        ? "bg-[#6b705c] text-white shadow-sm ring-1 ring-[#d4d1c9]" 
                        : "text-[#6b705c] hover:text-[#333d29] hover:bg-[#e9edc9]"
                    )}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {filename}
                  </button>
                ))}
              </div>
              <div className="flex-grow bg-[#faf9f6] overflow-auto p-4 relative group">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(pluginFiles[activeFile]);
                  }}
                  className="absolute top-4 right-4 bg-[#e9edc9] hover:bg-[#ccd5ae] text-[#6b705c] border border-[#ccd5ae] text-xs px-3 py-1.5 rounded-full font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  复制代码
                </button>
                <div className="border-l-2 border-[#a5a58d] pl-4">
                  <pre className="text-[12px] font-['Courier_New',Courier,monospace] leading-relaxed text-[#555]">
                    <code>{pluginFiles[activeFile]}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
