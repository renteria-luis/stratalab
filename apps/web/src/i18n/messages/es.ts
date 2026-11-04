import type { Messages } from './en';

/** Spanish UI strings. The `Messages` type makes a missing or extra key a type error. */
export const es: Messages = {
  'banner.text': 'Simulador educativo independiente — no está conectado a ninguna cuenta de AWS',

  'footer.trademark':
    'Amazon Web Services, AWS y las marcas relacionadas son marcas comerciales de Amazon.com, Inc. o sus filiales.',
  'footer.disclaimer':
    '{product} es un proyecto educativo independiente. No está afiliado, patrocinado ni respaldado por Amazon Web Services.',

  'top.logoAlt': 'Logotipo de {product}',
  'top.language': 'Idioma',
  'top.accountId': 'ID de cuenta: {id}',
  'top.overflowMenuTrigger': 'Más',
  'top.overflowMenuTitle': 'Todo',
  'top.searchIconAriaLabel': 'Buscar',
  'top.searchDismissIconAriaLabel': 'Cerrar búsqueda',

  'search.placeholder': 'Buscar [Alt+S]',
  'search.ariaLabel': 'Buscar servicios',
  'search.empty': 'Ningún servicio coincide con la búsqueda',

  'menu.button': 'Servicios',
  'menu.dialogLabel': 'Menú de servicios',
  'menu.viewsLabel': 'Vistas',
  'menu.categoriesLabel': 'Categorías',
  'menu.close': 'Cerrar el menú de servicios',
  'menu.favorite': 'Favorito: {name}',
  'menu.recent.empty': 'No hay servicios visitados recientemente',
  'menu.recent.emptyHint': 'Aquí aparecen los servicios que abras.',
  'menu.favorites.empty': 'Todavía no hay favoritos',
  'menu.favorites.emptyHint': 'Usa la estrella junto a un servicio para agregarlo aquí.',
  'menu.applications.empty': 'No hay aplicaciones',
  'menu.applications.emptyHint': 'Esta cuenta simulada no tiene aplicaciones.',

  'nav.opensInNewTab': 'Se abre en una pestaña nueva',
  'nav.badgeNew': 'Nuevo',
  'nav.filterNoOptions': 'No hay opciones disponibles',

  'breadcrumbs.ariaLabel': 'Ruta de navegación',
  'breadcrumbs.expandAriaLabel': 'Mostrar la ruta',

  'storage.backedUp':
    'No se pudo cargar la configuración guardada, así que la app empezó de cero. Se guardó una copia de respaldo de los datos anteriores en este navegador.',
  'storage.unreadable': 'No se pudo leer la configuración guardada, así que la app empezó de cero.',
  'storage.saveFailed':
    'No se pudo guardar la configuración en este navegador. Los cambios duran hasta que cierres la pestaña.',
  'storage.dismiss': 'Descartar',

  'home.title': 'Inicio de la consola',
  'home.board.empty': 'No hay widgets',
  'home.board.navigation': 'Navegación del tablero',
  'home.board.emptySlot': 'Vacío',
  'home.board.dragHandle': 'Control para mover',
  'home.board.resizeHandle': 'Control para cambiar el tamaño',
  'home.board.handleDescription':
    'Usa Espacio o Intro para activar, las flechas para mover, Espacio o Intro para confirmar, o Escape para descartar.',
  'home.board.started.reorder': 'Moviendo el widget',
  'home.board.started.resize': 'Cambiando el tamaño del widget',
  'home.board.started.insert': 'Insertando el widget',
  'home.board.reordered': 'Widget movido a la columna {column}, fila {row}.',
  'home.board.resized': 'Widget cambiado a {width} columnas y {height} filas.',
  'home.board.inserted': 'Widget insertado en la columna {column}, fila {row}.',
  'home.board.committed': 'Cambios aplicados.',
  'home.board.discarded': 'Cambios descartados.',
  'home.board.removed': 'Widget eliminado.',

  'home.recent.title': 'Visitados recientemente',
  'home.labs.title': 'Laboratorios en curso',
  'home.labs.empty': 'No hay laboratorios en curso',
  'home.labs.emptyHint': 'Aquí aparecen los laboratorios que inicies.',
  'home.health.title': 'Estado de la topología',
  'home.health.ok': 'No se encontraron problemas',
  'home.health.issues_one': '{count} problema encontrado',
  'home.health.issues_other': '{count} problemas encontrados',
  'home.health.resources': 'Recursos en la topología',
  'home.health.vpcs': 'VPC',
  'home.health.subnets': 'Subredes',
  'home.health.instances': 'Instancias',
  'home.health.severity.error': 'Error',
  'home.health.severity.warning': 'Advertencia',
  'home.cost.title': 'Costo estimado de esta topología',
  'home.cost.empty': 'Todavía no hay una instantánea de precios',
  'home.cost.emptyHint':
    'Las estimaciones aparecen cuando el build incluya una instantánea fechada de AWS Price List.',

  'functional.status': 'Llega con el laboratorio 1',
  'functional.hint': 'Esta vista será funcional con el laboratorio 1.',

  'empty.title': 'No hay recursos',
  'empty.hint': 'No hay recursos para mostrar en esta cuenta simulada.',

  'notFound.title': 'Página no encontrada',
  'notFound.hint': 'Esta dirección no coincide con ninguna página de la consola.',
  'notFound.home': 'Ir al inicio de la consola',

  'reference.notice': 'Solo referencia: este servicio no está simulado',
  'reference.noCard': 'Todavía no hay ficha.',
  'reference.docsLink': 'Documentación oficial',
  'reference.simulatedNotice': 'Este servicio está simulado',
  'reference.openConsole': 'Abrir la consola de {name}',
  'reference.details': 'Detalles',
  'reference.category': 'Categoría',
  'reference.examScope': 'Alcance de examen',
  'reference.examNone': 'No está en las listas de servicios incluidos de CLF-C02 ni SAA-C03',
  'reference.cardStatus': 'Estado de la ficha',
  'reference.card': 'Ficha de referencia',
  'reference.examCues': 'Señales de examen',
  'reference.notToConfuseWith': 'No confundir con',
  'reference.pricingModel': 'Modelo de precios',
  'reference.sharedResponsibility': 'Responsabilidad compartida',
  'reference.responsibilityAws': 'AWS',
  'reference.responsibilityCustomer': 'Cliente',
  'reference.sources': 'Fuentes',
  'reference.accessedOn': 'consultado el {date}',
};
