/**
 * 数据管理组件 - 用户数据导出和导入
 */
import { useState } from 'react';
import { Download, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { fetchWithAuth } from '../lib/fetch';

interface DataStats {
  conversations: number;
  messages: number;
  aiProviders: number;
}

interface ExportData {
  user: {
    username: string;
    displayName?: string;
    created_at: string;
  };
  stats: DataStats;
}

export default function DataManager() {
  const { user } = useAuthStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 获取导出预览
  const loadExportPreview = async () => {
    if (!user) return;
    
    try {
      const response = await fetchWithAuth(`/api/data/preview/${user.id}`);
      const result = await response.json();
      
      if (result.success) {
        setExportData(result.data);
      } else {
        setMessage({ type: 'error', text: result.error || '获取数据预览失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误，请重试' });
    }
  };

  // 导出数据
  const handleExport = async () => {
    if (!user) return;
    
    setIsExporting(true);
    setMessage(null);
    
    try {
      const response = await fetchWithAuth(`/api/data/export/${user.id}`);
      const result = await response.json();
      
      if (result.success) {
        // 创建下载链接
        const dataStr = JSON.stringify(result.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        // 触发下载
        const link = document.createElement('a');
        link.href = url;
        link.download = `gemini-chat-backup-${user.username}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setMessage({ type: 'success', text: '数据导出成功！' });
      } else {
        setMessage({ type: 'error', text: result.error || '导出失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误，请重试' });
    } finally {
      setIsExporting(false);
    }
  };

  // 导入数据
  const handleImport = async (file: File, mergeMode: 'replace' | 'merge' = 'merge') => {
    if (!user) return;
    
    setIsImporting(true);
    setMessage(null);
    
    try {
      const fileContent = await file.text();
      const importData = JSON.parse(fileContent);
      
      // 验证数据格式
      if (!importData.version) {
        throw new Error('无效的备份文件格式');
      }
      
      const response = await fetchWithAuth(`/api/data/import/${user.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: importData,
          mergeMode
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        const stats = result.stats;
        setMessage({ 
          type: 'success', 
          text: `数据导入成功！导入了 ${stats.conversations} 个对话，${stats.messages} 条消息，${stats.aiProviders} 个AI配置` 
        });
        
        // 重新加载预览数据
        await loadExportPreview();
      } else {
        setMessage({ type: 'error', text: result.error || '导入失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '文件格式错误' });
    } finally {
      setIsImporting(false);
    }
  };

  // 文件选择处理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (confirm('确定要导入这个备份文件吗？这将会与现有数据合并。')) {
        handleImport(file, 'merge');
      }
    }
  };

  // 初始加载预览数据
  useState(() => {
    if (user) {
      loadExportPreview();
    }
  });

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">数据管理</h3>
        <p className="text-sm text-gray-600">
          备份和恢复你的聊天记录、AI配置等数据
        </p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`p-3 rounded-lg flex items-center gap-2 ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* 数据概览 */}
      {exportData && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            数据概览
          </h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{exportData.stats.conversations}</div>
              <div className="text-gray-600">对话</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{exportData.stats.messages}</div>
              <div className="text-gray-600">消息</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{exportData.stats.aiProviders}</div>
              <div className="text-gray-600">AI配置</div>
            </div>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 导出数据 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
            <Download className="w-4 h-4" />
            导出数据
          </h4>
          <p className="text-sm text-gray-600 mb-3">
            将你的所有数据导出为JSON文件，可用于备份或迁移到其他设备
          </p>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                导出中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                导出数据
              </>
            )}
          </button>
        </div>

        {/* 导入数据 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
            <Upload className="w-4 h-4" />
            导入数据
          </h4>
          <p className="text-sm text-gray-600 mb-3">
            从备份文件恢复数据。导入的数据将与现有数据合并
          </p>
          <label className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer">
            {isImporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                导入中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                选择备份文件
              </>
            )}
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              disabled={isImporting}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* 注意事项 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 className="font-medium text-amber-800 mb-2">📋 使用说明</h4>
        <ul className="text-sm text-amber-700 space-y-1">
          <li>• 导出的数据文件包含所有聊天记录和AI配置</li>
          <li>• 导入数据时会与现有数据合并，不会覆盖</li>
          <li>• 建议定期备份数据，以防意外丢失</li>
          <li>• 备份文件可在不同设备间共享使用</li>
        </ul>
      </div>
    </div>
  );
}