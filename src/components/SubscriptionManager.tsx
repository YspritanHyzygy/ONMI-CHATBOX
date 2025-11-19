/**
 * 订阅管理组件 - 商业化功能界面
 */
import { useState, useEffect } from 'react';
import { Crown, Check, Zap, Star } from 'lucide-react';
import useAuthStore from '../store/authStore';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: { monthly: number; yearly: number };
  features: string[];
  limits: {
    dailyRequests: number;
    monthlyRequests: number;
    maxTokensPerRequest: number;
    concurrentRequests: number;
  };
  recommended?: boolean;
}

interface Subscription {
  plan: string;
  status: string;
  limits: any;
  features: string[];
}

interface UsageStats {
  current: {
    daily: number;
    monthly: number;
    tokens: number;
  };
  limits: {
    daily: number;
    monthly: number;
    maxTokens: number;
  };
  remaining: {
    daily: number;
    monthly: number;
  };
}

export default function SubscriptionManager() {
  const { user } = useAuthStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    if (user) {
      loadSubscriptionData();
    }
  }, [user]);

  const loadSubscriptionData = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      // 并行加载所有数据
      const [plansRes, subscriptionRes, usageRes] = await Promise.all([
        fetch('/api/business/plans'),
        fetch(`/api/business/subscription/${user.id}`),
        fetch(`/api/business/usage/${user.id}`)
      ]);

      const [plansData, subscriptionData, usageData] = await Promise.all([
        plansRes.json(),
        subscriptionRes.json(),
        usageRes.json()
      ]);

      if (plansData.success) {
        setPlans(plansData.data);
      }

      if (subscriptionData.success) {
        setCurrentSubscription(subscriptionData.data);
      }

      if (usageData.success) {
        setUsageStats(usageData.data);
      }
    } catch (error) {
      console.error('Failed to load subscription data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = (planId: string) => {
    // TODO: 实现订阅升级逻辑
    alert(`订阅功能暂未开放，敬请期待！\n选择的计划：${planId}`);
  };

  const formatNumber = (num: number) => {
    if (num === -1) return '无限制';
    return num.toLocaleString();
  };

  const getUsagePercentage = (current: number, limit: number) => {
    if (limit === -1) return 0;
    return Math.min((current / limit) * 100, 100);
  };

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 当前订阅状态 */}
      {currentSubscription && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                当前计划：{currentSubscription.plan === 'free' ? '免费版' : 
                         currentSubscription.plan === 'pro' ? '专业版' : '企业版'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                状态：<span className="text-green-600 font-medium">活跃</span>
              </p>
            </div>
            {currentSubscription.plan === 'free' && (
              <button
                onClick={() => handleUpgrade('pro')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                升级计划
              </button>
            )}
          </div>
        </div>
      )}

      {/* 使用统计 */}
      {usageStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 mb-3">今日使用量</h4>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>API请求</span>
                  <span>{usageStats.current.daily} / {formatNumber(usageStats.limits.daily)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${getUsagePercentage(usageStats.current.daily, usageStats.limits.daily)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 mb-3">本月使用量</h4>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>API请求</span>
                  <span>{usageStats.current.monthly} / {formatNumber(usageStats.limits.monthly)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${getUsagePercentage(usageStats.current.monthly, usageStats.limits.monthly)}%` }}
                  ></div>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                已使用 tokens: {usageStats.current.tokens.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 订阅计划 */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900">选择订阅计划</h3>
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                billingPeriod === 'monthly' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              月付
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                billingPeriod === 'yearly' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              年付 <span className="text-green-600 text-xs ml-1">省20%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-lg border-2 p-6 relative ${
                plan.recommended 
                  ? 'border-blue-500 shadow-lg' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {plan.recommended && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-500 text-white px-3 py-1 text-xs rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    推荐
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h4 className="text-xl font-semibold text-gray-900 mb-2">{plan.name}</h4>
                <p className="text-gray-600 text-sm mb-4">{plan.description}</p>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900">
                    ¥{billingPeriod === 'monthly' ? plan.price.monthly : plan.price.yearly}
                  </span>
                  <span className="text-gray-600 text-sm">
                    /{billingPeriod === 'monthly' ? '月' : '年'}
                  </span>
                  {billingPeriod === 'yearly' && plan.price.yearly > 0 && (
                    <div className="text-xs text-green-600 mt-1">
                      相比月付节省 ¥{(plan.price.monthly * 12 - plan.price.yearly)}
                    </div>
                  )}
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="border-t pt-4 mb-6">
                <h5 className="font-medium text-gray-900 mb-2">使用限制</h5>
                <div className="space-y-1 text-xs text-gray-600">
                  <div>每日请求：{formatNumber(plan.limits.dailyRequests)}</div>
                  <div>每月请求：{formatNumber(plan.limits.monthlyRequests)}</div>
                  <div>最大tokens：{formatNumber(plan.limits.maxTokensPerRequest)}</div>
                </div>
              </div>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={currentSubscription?.plan === plan.id}
                className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                  currentSubscription?.plan === plan.id
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : plan.recommended
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {currentSubscription?.plan === plan.id ? '当前计划' : '选择此计划'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 说明信息 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          💡 订阅功能预览
        </h4>
        <div className="text-sm text-amber-700 space-y-1">
          <p>• 当前为开源版本，所有功能免费使用</p>
          <p>• 订阅功能将在商业化版本中提供</p>
          <p>• 商业化版本将支持更多AI模型和企业级功能</p>
          <p>• 数据始终保持本地存储，隐私安全有保障</p>
        </div>
      </div>
    </div>
  );
}