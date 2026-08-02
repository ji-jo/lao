/**
 * Stands in for `@tanstack/react-router`, which the dock was written against on
 * its original site. This project is Astro with plain document navigation, so
 * `Link` is an anchor and the router store is just `window.location`.
 */
import { useEffect, useState, type ComponentPropsWithoutRef } from 'react';

type RouterState = { location: { pathname: string } };

export function useRouterState<T>({ select }: { select: (s: RouterState) => T }): T {
  const read = () =>
    select({ location: { pathname: typeof window === 'undefined' ? '/' : window.location.pathname } });

  const [value, setValue] = useState<T>(read);

  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

type LinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & { to?: string };

export function Link({ to, ...props }: LinkProps) {
  return <a href={to} {...props} />;
}
