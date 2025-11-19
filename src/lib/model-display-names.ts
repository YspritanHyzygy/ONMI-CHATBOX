/**
 * 模型显示名称转换工具
 * 将模型 ID 转换为用户友好的显示名称，同时保留原始 ID 用于 API 调用
 */

export interface ModelEntry {
    id: string;        // 原始模型 ID，用于 API 调用
    name: string;      // 友好显示名称，用于用户界面
}

export function convertModelIdToDisplayName(modelId: string): string {
    // 特殊映射表，处理不规则的转换
    const specialMappings: Record<string, string> = {
        // OpenAI 模型
        'gpt-4o': 'GPT-4o',
        'gpt-4o-mini': 'GPT-4o Mini',
        'gpt-4-turbo': 'GPT-4 Turbo',
        'gpt-3.5-turbo': 'GPT-3.5 Turbo',
        'o3': 'o3',
        'o3-mini': 'o3 Mini',
        'gpt-5': 'GPT-5',

        // Claude 模型
        'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
        'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
        'claude-opus-4-1-20250805': 'Claude Opus 4.1',
        'claude-opus-4-20250514': 'Claude Opus 4',
        'claude-sonnet-4-20250514': 'Claude Sonnet 4',
        'claude-3-7-sonnet-20250219': 'Claude 3.7 Sonnet',

        // Gemini 模型
        'gemini-2.5-pro': 'Gemini 2.5 Pro',
        'gemini-2.5-flash': 'Gemini 2.5 Flash',
        'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
        'gemini-2.0-flash': 'Gemini 2.0 Flash',
        'gemini-2.0-flash-lite': 'Gemini 2.0 Flash-Lite',
        'gemini-2.0-pro': 'Gemini 2.0 Pro',
        'gemini-1.5-pro': 'Gemini 1.5 Pro',
        'gemini-1.5-flash': 'Gemini 1.5 Flash',
        'gemini-1.5-flash-8b': 'Gemini 1.5 Flash-8B',

        // xAI Grok 模型
        'grok-4': 'Grok 4',
        'grok-3': 'Grok 3',
        'grok-2-1212': 'Grok 2 (1212)',
        'grok-2-vision-1212': 'Grok 2 Vision (1212)',
    };

    // 如果有特殊映射，直接返回
    if (specialMappings[modelId]) {
        return specialMappings[modelId];
    }

    // 通用转换规则
    return modelId
        // 替换连字符为空格
        .replace(/-/g, ' ')
        // 首字母大写
        .replace(/\b\w/g, letter => letter.toUpperCase())
        // 处理版本号格式
        .replace(/\b(\d+)\.(\d+)\b/g, '$1.$2')
        // 处理特殊词汇
        .replace(/\bExp\b/g, 'Experimental')
        .replace(/\bPro\b/g, 'Pro')
        .replace(/\bFlash\b/g, 'Flash')
        .replace(/\bLite\b/g, 'Lite')
        .replace(/\bMini\b/g, 'Mini')
        .replace(/\bTurbo\b/g, 'Turbo')
        // 移除日期格式的版本号 (如 20241022)
        .replace(/\s+\d{8}\s*$/, '')
        // 清理多余空格
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 将模型 ID 列表转换为包含 ID 和显示名称的对象列表
 */
export function convertModelListToEntries(modelIds: string[]): ModelEntry[] {
    return modelIds.map(id => ({
        id,
        name: convertModelIdToDisplayName(id)
    }));
}

/**
 * 创建模型 ID 到显示名称的映射对象
 */
export function createModelDisplayMap(modelIds: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    modelIds.forEach(id => {
        map[id] = convertModelIdToDisplayName(id);
    });
    return map;
}

/**
 * 向后兼容：批量转换模型列表为显示名称（仅用于显示）
 * @deprecated 建议使用 convertModelListToEntries 来保持 ID 和显示名称的关联
 */
export function convertModelListToDisplayNames(modelIds: string[]): string[] {
    return modelIds.map(convertModelIdToDisplayName);
}