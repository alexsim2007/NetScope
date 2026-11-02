import { NavLink, useLocation } from 'react-router-dom';
import { PageTitle } from '../components/ui';
import Analytics from './Analytics';
import Events from './Events';

export default function ActivityPage() {
  const events = useLocation().pathname.endsWith('/events');
  return (
    <>
      <PageTitle title="Активность">История трафика и события сети.</PageTitle>
      <nav className="page-tabs" aria-label="Раздел активности">
        <NavLink to="/activity" end>
          Трафик
        </NavLink>
        <NavLink to="/activity/events">События</NavLink>
      </nav>
      {events ? <Events /> : <Analytics />}
    </>
  );
}
