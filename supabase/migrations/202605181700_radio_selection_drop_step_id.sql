-- Remove redundant `id` from radio_selection steps (prompt + options only).

begin;

set search_path = public;

update public.assistance_services s
set
  radio_selection = n.new_radio,
  updated_at = now()
from (
  select
    s2.id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'version', 1,
        'reminder_html', nullif(trim(s2.radio_selection ->> 'reminder_html'), ''),
        'steps', coalesce(
          (
            select jsonb_agg(step_norm order by step_ord)
            from jsonb_array_elements(s2.radio_selection -> 'steps')
              with ordinality as st(step, step_ord)
            cross join lateral (
              select jsonb_build_object(
                'prompt', step ->> 'prompt',
                'options', coalesce(
                  (
                    select jsonb_agg(choice_text order by opt_ord)
                    from jsonb_array_elements(step -> 'options')
                      with ordinality as op(opt, opt_ord)
                    cross join lateral (
                      select case jsonb_typeof(opt)
                        when 'string' then nullif(trim(opt #>> '{}'), '')
                        else coalesce(
                          nullif(trim(opt ->> 'label'), ''),
                          nullif(trim(opt ->> 'value'), '')
                        )
                      end as choice_text
                    ) c
                    where c.choice_text is not null
                  ),
                  '[]'::jsonb
                )
              ) as step_norm
            ) sn
            where nullif(trim(sn.step_norm ->> 'prompt'), '') is not null
              and jsonb_array_length(sn.step_norm -> 'options') > 0
          ),
          '[]'::jsonb
        )
      )
    ) as new_radio
  from public.assistance_services s2
  where s2.radio_selection is not null
    and jsonb_typeof(s2.radio_selection) = 'object'
) n
where s.id = n.id
  and n.new_radio is not null
  and jsonb_array_length(n.new_radio -> 'steps') > 0;

commit;
