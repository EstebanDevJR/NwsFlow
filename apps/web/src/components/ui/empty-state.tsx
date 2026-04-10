import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon: Icon, action }: EmptyStateProps) {
  return (
    <Card className="liquid-glass p-12 text-center flex flex-col items-center justify-center">
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-medium">{title}</h3>
      {description && <p className="text-muted-foreground mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
