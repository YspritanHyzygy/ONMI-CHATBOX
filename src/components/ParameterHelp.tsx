import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface ParameterHelpProps {
  parameter: string;
  provider?: string;
}

const PARAMETER_DESCRIPTIONS: Record<string, Record<string, { title: string; description: string; tips: string[] }>> = {
  temperature: {
    common: {
      title: "Temperature (创造性)",
      description: "控制输出的随机性和创造性。较低的值产生更确定和一致的输出，较高的值产生更多样和创造性的输出。",
      tips: [
        "0.0-0.3: 适合事实性任务、代码生成、翻译",
        "0.4-0.7: 适合一般对话、写作辅助",
        "0.8-1.0: 适合创意写作、头脑风暴",
        "1.0+: 高度创造性，但可能不够连贯"
      ]
    }
  },
  maxTokens: {
    common: {
      title: "Max Tokens (最大输出长度)",
      description: "限制模型生成的最大token数量。1个token大约等于0.75个英文单词或1个中文字符。",
      tips: [
        "不设置: 让模型自动判断合适的长度",
        "短回答: 100-500 tokens",
        "中等回答: 500-2000 tokens", 
        "长回答: 2000+ tokens",
        "注意：设置过低可能导致回答被截断"
      ]
    }
  },
  topP: {
    common: {
      title: "Top-P (核采样)",
      description: "控制词汇选择的多样性。只考虑累积概率达到P的最可能的词汇。与temperature配合使用效果更佳。",
      tips: [
        "0.1-0.3: 非常保守，输出高度一致",
        "0.4-0.7: 平衡的多样性",
        "0.8-0.95: 较高多样性",
        "1.0: 考虑所有可能的词汇",
        "通常与较低的temperature搭配使用"
      ]
    }
  },
  topK: {
    gemini: {
      title: "Top-K (候选词数量)",
      description: "限制每步只考虑概率最高的K个词汇。较小的值产生更集中的输出。",
      tips: [
        "1-10: 非常保守，适合事实性任务",
        "20-40: 平衡的选择范围（推荐）",
        "50+: 更多样化的输出",
        "Gemini特有参数，与topP互补"
      ]
    },
    claude: {
      title: "Top-K (候选词数量)", 
      description: "限制每步只考虑概率最高的K个词汇。Claude使用较小的K值。",
      tips: [
        "1-5: 高度集中（推荐）",
        "5-20: 适度多样性",
        "Claude对topK较为敏感"
      ]
    },
    ollama: {
      title: "Top-K (候选词数量)",
      description: "限制每步只考虑概率最高的K个词汇。本地模型可以使用较大的值。",
      tips: [
        "20-40: 标准设置",
        "40-100: 更多样化",
        "与repetition_penalty配合效果好"
      ]
    }
  },
  frequencyPenalty: {
    openai: {
      title: "Frequency Penalty (频率惩罚)",
      description: "减少模型重复使用已经出现过的词汇的倾向。正值减少重复，负值增加重复。",
      tips: [
        "0.0: 无惩罚（默认）",
        "0.1-0.5: 轻微减少重复",
        "0.5-1.0: 明显减少重复",
        "负值: 鼓励重复（很少使用）"
      ]
    },
    xai: {
      title: "Frequency Penalty (频率惩罚)",
      description: "Grok模型的频率惩罚机制，减少词汇重复。",
      tips: [
        "0.0: 无惩罚",
        "0.1-0.3: 轻微惩罚（推荐）",
        "0.5+: 强惩罚，可能影响连贯性"
      ]
    }
  },
  presencePenalty: {
    openai: {
      title: "Presence Penalty (存在惩罚)",
      description: "减少模型谈论相同主题的倾向。正值鼓励谈论新主题，负值鼓励深入当前主题。",
      tips: [
        "0.0: 无惩罚（默认）",
        "0.1-0.5: 鼓励新主题",
        "0.5-1.0: 强烈鼓励多样性",
        "负值: 鼓励深入当前主题"
      ]
    },
    xai: {
      title: "Presence Penalty (存在惩罚)",
      description: "Grok模型的主题多样性控制。",
      tips: [
        "0.0: 无惩罚",
        "0.1-0.3: 适度多样性",
        "与frequency_penalty配合使用"
      ]
    }
  },
  repetitionPenalty: {
    ollama: {
      title: "Repetition Penalty (重复惩罚)",
      description: "Ollama特有的重复惩罚机制。值大于1.0减少重复，小于1.0增加重复。",
      tips: [
        "1.0: 无惩罚",
        "1.05-1.15: 轻微惩罚（推荐）",
        "1.2+: 强惩罚，可能影响流畅性",
        "0.9-1.0: 允许更多重复"
      ]
    }
  }
};

export default function ParameterHelp({ parameter, provider = 'common' }: ParameterHelpProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const helpData = PARAMETER_DESCRIPTIONS[parameter]?.[provider] || 
                   PARAMETER_DESCRIPTIONS[parameter]?.['common'];

  if (!helpData) return null;

  // 全局点击管理 - 当点击其他ParameterHelp时关闭当前面板
  useEffect(() => {
    const handleGlobalParameterHelpClick = (event: CustomEvent) => {
      if (event.detail !== buttonRef.current) {
        setIsOpen(false);
      }
    };

    document.addEventListener('parameterHelpClick', handleGlobalParameterHelpClick as EventListener);
    return () => {
      document.removeEventListener('parameterHelpClick', handleGlobalParameterHelpClick as EventListener);
    };
  }, []);

  // 点击外部关闭，但不使用全屏遮罩
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && 
          !tooltipRef.current?.contains(event.target as Node) && 
          !buttonRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 发送全局事件，通知其他ParameterHelp组件关闭
    const event = new CustomEvent('parameterHelpClick', { detail: buttonRef.current });
    document.dispatchEvent(event);
    
    if (!isOpen && buttonRef.current) {
      // 计算按钮位置
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const tooltipWidth = 288; // w-72 = 18rem = 288px
      const tooltipHeight = 200; // 大概高度
      
      // 智能定位策略：提示面板右边角对齐徽标
      let left;
      const minLeftMargin = 16; // 最小左边距
      
      // 计算让提示面板右边角对齐徽标中心的位置
      const iconCenter = rect.left + (rect.width / 2);
      const alignedLeft = iconCenter - tooltipWidth; // 面板右边对齐徽标中心
      
      if (alignedLeft >= minLeftMargin) {
        // 如果对齐位置不会超出左边界，使用对齐位置
        left = alignedLeft;
      } else {
        // 否则尽量靠左，保持最小边距
        left = minLeftMargin;
      }
      
      let top = rect.bottom + 8;
      
      // 如果下方空间不够，显示在上方
      if (top + tooltipHeight > viewportHeight) {
        top = rect.top - tooltipHeight - 8;
      }
      
      setTooltipStyle({
        left: `${left}px`,
        top: `${top}px`
      });
    }
    
    setIsOpen(!isOpen);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-1 text-gray-400 hover:text-blue-500 transition-colors cursor-pointer"
        title={`${helpData.title} 说明`}
      >
        <HelpCircle size={16} />
      </button>

      {isOpen && (
        /* 提示面板 - 直接显示，不使用全屏遮罩 */
        <div 
          ref={tooltipRef}
          className="fixed z-50 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 max-h-80 overflow-y-auto custom-scrollbar"
          style={tooltipStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {helpData.title}
            </h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={16} />
            </button>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            {helpData.description}
          </p>

          <div className="space-y-2">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              使用建议
            </h4>
            <ul className="space-y-1">
              {helpData.tips.map((tip, index) => (
                <li key={index} className="text-xs text-gray-600 dark:text-gray-300 flex items-start">
                  <span className="w-1 h-1 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
