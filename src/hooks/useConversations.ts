import { useState, useEffect } from 'react';
import { getUserId } from '../lib/user';
import { getValidatedConversations, setStorageItem } from '../lib/storage';
import { fetchWithAuth } from '../lib/fetch';
import type { Conversation } from '../pages/Chat';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);

  // 保存conversations到localStorage
  const saveConversationsToStorage = (conversations: Conversation[]) => {
    const result = setStorageItem('conversations', conversations);
    if (!result.success) {
      console.error('保存对话列表到localStorage失败:', result.error);
    }
  };

  // 从localStorage加载conversations
  const loadConversationsFromStorage = () => {
    const result = getValidatedConversations('conversations');

    if (result.success && result.data) {
      // 确保日期对象正确转换
      const conversations = result.data.map((conv: any) => ({
        ...conv,
        created_at: new Date(conv.created_at),
        messages: conv.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
      console.log('[DEBUG] 从localStorage加载的对话:', conversations);
      setConversations(conversations);
    } else if (result.error) {
      console.error('从localStorage加载对话列表失败:', result.error);
      // 不要设置空数组，保持当前状态
    } else {
      console.log('[DEBUG] localStorage中没有保存的对话');
    }
  };

  const loadConversations = async () => {
    try {
      const userId = getUserId();
      const response = await fetchWithAuth(`/api/chat/conversations?userId=${userId}`);

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.conversations) && data.conversations.length > 0) {
          // 确保日期对象正确转换
          const apiConversations = data.conversations.map((conv: any) => ({
            ...conv,
            created_at: new Date(conv.created_at)
          }));

          // 按创建时间倒序排列
          apiConversations.sort((a: any, b: any) => b.created_at.getTime() - a.created_at.getTime());

          console.log('[DEBUG] 从API获取到对话，更新状态:', apiConversations);
          setConversations(apiConversations);
          // 同步保存到localStorage
          saveConversationsToStorage(apiConversations);
        } else {
        }
      } else {
        console.warn('[DEBUG] API调用失败，保持当前状态');
      }
    } catch (error) {
      console.error('[DEBUG] API调用异常，保持当前状态:', error);
    }
  };

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const response = await fetchWithAuth(`/api/chat/conversations/${conversationId}/messages`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          return result.data.map((msg: any) => ({
            id: msg.id,
            content: msg.content,
            role: msg.role,
            timestamp: new Date(msg.created_at),
            hasThinking: msg.has_thinking,
            thinkingContent: msg.thinking_content,
            thinkingTokens: msg.thinking_tokens,
            reasoningEffort: msg.reasoning_effort,
            thoughtSignature: msg.thought_signature
          }));
        }
      }
      return [];
    } catch (error) {
      console.error('加载消息失败:', error);
      return [];
    }
  };

  const handleConversationSelect = async (conversation: Conversation) => {
    const messages = await loadConversationMessages(conversation.id);
    const conversationWithMessages = { ...conversation, messages };
    setCurrentConversation(conversationWithMessages);

    // 更新conversations列表中的对话数据
    setConversations(prev => {
      const updatedConversations = prev.map(conv =>
        conv.id === conversation.id ? conversationWithMessages : conv
      );
      saveConversationsToStorage(updatedConversations);
      return updatedConversations;
    });

    // 更新URL参数，这样刷新页面时能保持当前对话
    const url = new URL(window.location.href);
    url.searchParams.set('conversation', conversation.id);
    window.history.replaceState({}, '', url.toString());
  };

  const createNewConversation = () => {
    setCurrentConversation(null);

    // 清除URL参数，因为这是新对话
    const url = new URL(window.location.href);
    url.searchParams.delete('conversation');
    window.history.replaceState({}, '', url.toString());
  };

  // 清理历史记录 - 删除所有对话
  const clearAllConversations = async () => {
    if (confirm('确定要清除所有历史记录吗？此操作不可撤销。')) {
      try {
        // 获取所有对话ID
        const conversationIds = conversations.map(conv => conv.id);

        // 逐个删除对话（后端API）
        for (const id of conversationIds) {
          await fetchWithAuth(`/api/chat/conversations/${id}`, {
            method: 'DELETE'
          });
        }

        // 清空前端状态
        setConversations([]);
        setCurrentConversation(null);
        saveConversationsToStorage([]);

        // 清除URL参数
        const url = new URL(window.location.href);
        url.searchParams.delete('conversation');
        window.history.replaceState({}, '', url.toString());

        console.log('已清除所有历史记录');
      } catch (error) {
        console.error('清除历史记录失败:', error);
        alert('清除历史记录失败，请稍后重试');
      }
    }
  };

  // 检查URL参数并加载对应对话
  const checkUrlParams = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const conversationId = urlParams.get('conversation');

    if (conversationId && conversations.length > 0) {
      try {
        // 从已加载的对话列表中找到对应的对话信息
        const conversation = conversations.find((conv: Conversation) => conv.id === conversationId);

        if (conversation) {
          setCurrentConversation(conversation);
        }
      } catch (error) {
        console.error('加载URL指定的对话失败:', error);
      }
    }
  };

  // 当conversations加载完成后，检查URL参数
  useEffect(() => {
    if (conversations.length > 0) {
      checkUrlParams();
    }
  }, [conversations]);

  return {
    conversations,
    setConversations,
    currentConversation,
    setCurrentConversation,
    loadConversations,
    loadConversationsFromStorage,
    saveConversationsToStorage,
    loadConversationMessages,
    handleConversationSelect,
    createNewConversation,
    clearAllConversations,
  };
}
