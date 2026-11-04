import Autosuggest, { type AutosuggestProps } from '@cloudscape-design/components/autosuggest';
import { searchServices } from '@sim/catalog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../i18n/useT';
import { serviceHrefById } from '../routes/appRoutes';
import { SEARCH_LIMIT, isFocusSearchShortcut, searchIndex } from './menuData';

/** Global search over the catalog (CAT-08 ranking lives in packages/catalog). Alt+S focuses it. */
export function GlobalSearch() {
  const { t } = useT();
  const navigate = useNavigate();
  const ref = useRef<AutosuggestProps.Ref>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isFocusSearchShortcut(event)) return;
      event.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const options = useMemo<AutosuggestProps.Options>(
    () =>
      searchServices(searchIndex, value, SEARCH_LIMIT).map((service) => ({
        value: service.id,
        label: service.name,
        description: service.menuDescription,
      })),
    [value],
  );

  return (
    <Autosuggest
      ref={ref}
      value={value}
      options={options}
      filteringType="manual"
      hideEnteredTextOption
      placeholder={t('search.placeholder')}
      ariaLabel={t('search.ariaLabel')}
      empty={value.trim() === '' ? undefined : t('search.empty')}
      onChange={({ detail }) => {
        setValue(detail.value);
      }}
      onSelect={({ detail }) => {
        const serviceId = detail.selectedOption?.value;
        if (serviceId === undefined) return;
        setValue('');
        void navigate(serviceHrefById(serviceId));
      }}
    />
  );
}
