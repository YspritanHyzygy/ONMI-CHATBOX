import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings as SettingsIcon, Check, User, Globe, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AIProvider, ProviderConfig } from './types';

interface SettingsLayoutProps {
  providers: AIProvider[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  getProviderConfig: (providerId: string) => ProviderConfig | undefined;
  children: React.ReactNode;
}

export default function SettingsLayout({
  providers,
  activeTab,
  setActiveTab,
  getProviderConfig,
  children,
}: SettingsLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center">
              <Link
                to="/"
                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors mr-4"
              >
                <ArrowLeft className="w-5 h-5 mr-1" />
                {t('common.back')}
              </Link>
              <SettingsIcon className="w-8 h-8 text-primary mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('settings.aiProviders')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar navigation */}
          <div className="lg:w-64">
            <nav className="space-y-1">
              {providers.map((provider) => {
                const config = getProviderConfig(provider.id);
                const isConfigured = config &&
                  (provider.id === 'ollama'
                    ? config.config.base_url && config.config.base_url.trim() !== ''
                    : config.config.api_key && config.config.api_key.trim() !== '');

                return (
                  <button
                    key={provider.id}
                    onClick={() => setActiveTab(provider.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200',
                      activeTab === provider.id
                        ? 'bg-primary/10 text-primary border-r-2 border-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{provider.name}</span>
                      <div className="flex items-center space-x-1">
                        {config?.is_default && (
                          <Badge variant="secondary" className="text-xs">
                            {t('common.default')}
                          </Badge>
                        )}
                        {isConfigured && (
                          <Check className="w-4 h-4 text-success" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Utility tabs */}
              <div className="pt-4 border-t border-border">
                <button
                  onClick={() => setActiveTab('user-management')}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200',
                    activeTab === 'user-management'
                      ? 'bg-primary/10 text-primary border-r-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <div className="flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    <span>{t('settings.userManagement')}</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('language-settings')}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200',
                    activeTab === 'language-settings'
                      ? 'bg-primary/10 text-primary border-r-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <div className="flex items-center">
                    <Globe className="w-4 h-4 mr-2" />
                    <span>{t('settings.languageSettings')}</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('cache-management')}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200',
                    activeTab === 'cache-management'
                      ? 'bg-primary/10 text-primary border-r-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <div className="flex items-center">
                    <Trash2 className="w-4 h-4 mr-2" />
                    <span>{t('settings.cacheManagement')}</span>
                  </div>
                </button>
              </div>
            </nav>
          </div>

          {/* Main content area */}
          <div className="flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
