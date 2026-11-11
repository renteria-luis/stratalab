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

  'storage.backedUp':
    'No se pudo cargar la configuración guardada, así que la app empezó de cero. Se guardó una copia de respaldo de los datos anteriores en este navegador.',
  'storage.unreadable': 'No se pudo leer la configuración guardada, así que la app empezó de cero.',
  'storage.saveFailed':
    'No se pudo guardar la configuración en este navegador. Los cambios duran hasta que cierres la pestaña.',
  'storage.dismiss': 'Descartar',

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
  'storage.topology.backedUp':
    'No se pudo cargar la topología guardada, así que el sandbox empezó vacío. Se guardó una copia de respaldo en este navegador.',
  'storage.topology.unreadable':
    'No se pudo leer la topología guardada, así que el sandbox empezó vacío.',
  'storage.topology.saveFailed':
    'No se pudo guardar la topología en este navegador. Los cambios duran hasta que cierres la pestaña.',

  'fidelity.Exact': 'Exacto',
  'fidelity.Inferred': 'Inferido',
  'fidelity.Unsupported': 'No soportado',
  'fidelity.Exact.description': 'Coincide con una regla documentada de AWS.',
  'fidelity.Inferred.description':
    'Modelo del simulador para algo que AWS no explica en un solo lugar, o una simplificación.',
  'fidelity.Unsupported.description':
    'No se simula en esta versión. Nunca lo tomes como permitido, gratis o instantáneo.',
  'fidelity.title': 'Fidelidad del simulador: {label}',
  'fidelity.rules': 'Reglas: {ruleIds}',
  'fidelity.notSimulated': 'No se simula en esta versión',

  'change.rejected': 'AWS rechazaría este cambio',
  'change.failed': 'No se puede hacer este cambio',

  'helper.UNKNOWN_REFERENCE': '{id} ya no existe.',
  'helper.INVALID_INPUT': 'Algunos valores no son válidos: {details}',
  'helper.NO_FREE_PRIVATE_ADDRESS':
    'La subred {subnetId} ({cidrBlock}) no tiene direcciones IPv4 privadas libres.',
  'helper.PUBLIC_POOL_EXHAUSTED':
    'El pool simulado de IPv4 públicas ({pool}) no tiene direcciones libres.',
  'helper.IGW_ALREADY_ATTACHED':
    'El internet gateway {internetGatewayId} ya está conectado a {vpcId}.',
  'helper.VPC_ALREADY_HAS_IGW':
    '{vpcId} ya tiene el internet gateway {internetGatewayId}. Una VPC solo puede tener un internet gateway.',
  'helper.IGW_NOT_ATTACHED':
    'El internet gateway {internetGatewayId} no está conectado a ninguna VPC.',
  'helper.IGW_HAS_PUBLIC_ADDRESSES_one':
    'No se puede desconectar el internet gateway {internetGatewayId}: {vpcId} tiene {count} interfaz de red o NAT gateway con IPv4 pública.',
  'helper.IGW_HAS_PUBLIC_ADDRESSES_other':
    'No se puede desconectar el internet gateway {internetGatewayId}: {vpcId} tiene {count} interfaces de red o NAT gateways con IPv4 pública.',
  'helper.NAT_VPC_NO_INTERNET_GATEWAY':
    'La red {vpcId} no tiene un internet gateway conectado, así que no se puede crear un NAT gateway público en {subnetId}.',

  'issue.VPC_SIZE_INVALID':
    'El CIDR de VPC {cidrBlock} es un /{prefixLength}. Un CIDR de VPC debe estar entre /{minPrefixLength} y /{maxPrefixLength}.',
  'issue.VPC_CIDR_RESTRICTED':
    'El CIDR de VPC {cidrBlock} está dentro de {restrictedBlock}, que AWS no permite para una VPC.',
  'issue.SUBNET_SIZE_INVALID':
    'El CIDR de subred {cidrBlock} es un /{prefixLength}. Un CIDR de subred debe estar entre /{minPrefixLength} y /{maxPrefixLength}.',
  'issue.SUBNET_CIDR_OUT_OF_VPC':
    'El CIDR de subred {cidrBlock} no está dentro del CIDR de la VPC {vpcCidrBlock}.',
  'issue.CIDR_OVERLAP':
    'El CIDR de subred {cidrBlock} se solapa con {otherCidrBlock} de la subred {relatedId}.',
  'issue.IP_OUT_OF_SUBNET':
    'La dirección IPv4 privada {ipAddress} no está en la subred {subnetCidrBlock}.',
  'issue.IP_RESERVED':
    'La dirección IPv4 privada {ipAddress} está reservada en {subnetCidrBlock}: {purpose}.',
  'issue.IP_DUPLICATE.private': 'La dirección IPv4 privada {ipAddress} ya la usa {relatedId}.',
  'issue.IP_DUPLICATE.public': 'La dirección IPv4 pública {ipAddress} ya la usa {relatedId}.',
  'issue.PUBLIC_IP_INVALID.rfc1918':
    'La dirección IPv4 pública {ipAddress} es privada (RFC 1918, {range}), así que no puede ser pública.',
  'issue.PUBLIC_IP_INVALID.rfc6598':
    'La dirección IPv4 pública {ipAddress} está en el espacio compartido (RFC 6598, {range}), así que no puede ser pública.',
  'issue.PUBLIC_IP_INVALID.restricted':
    'La dirección IPv4 pública {ipAddress} está en el rango restringido {range}, así que no puede ser pública.',
  'issue.PUBLIC_IP_INVALID.vpc-cidr':
    'La dirección IPv4 pública {ipAddress} está dentro del CIDR de VPC {range}, así que no puede ser pública.',
  'issue.VPC_MISMATCH': '{resourceId} está en {vpcId}, pero {relatedId} pertenece a {otherVpcId}.',
  'issue.ROUTE_DUPLICATE_DESTINATION':
    'La tabla de rutas ya tiene una ruta hacia {destinationCidrBlock}.',
  'issue.ROUTE_DESTINATION_RESERVED':
    'El destino {destinationCidrBlock} está dentro de {reservedBlock}, que AWS reserva para sus propios servicios.',
  'issue.LOCAL_ROUTE_CONFLICT':
    'El destino {destinationCidrBlock} es el CIDR de la VPC {vpcCidrBlock} o está dentro de él. La ruta local ya lo cubre.',
  'issue.IGW_MULTIPLE_ATTACHED': '{vpcId} ya tiene conectado el internet gateway {relatedId}.',
  'issue.NAT_SUBNET_NOT_PUBLIC':
    'El NAT gateway {resourceId} está en la subred {subnetId}, cuya tabla de rutas {routeTableId} no tiene una ruta a un internet gateway. Un NAT gateway público necesita una subred pública.',
  'issue.NAT_VPC_NO_INTERNET_GATEWAY':
    'El NAT gateway {resourceId} está en {vpcId}, que no tiene un internet gateway conectado.',
  'issue.SG_NAME_INVALID.empty': 'El campo {field} del grupo de seguridad es obligatorio.',
  'issue.SG_NAME_INVALID.too-long':
    'El campo {field} del grupo de seguridad admite hasta {maxLength} caracteres.',
  'issue.SG_NAME_INVALID.invalid-characters':
    'El campo {field} del grupo de seguridad solo admite a-z, A-Z, 0-9, espacios y ._-:/()#,@[]+=&;{}!$*',
  'issue.SG_NAME_INVALID.sg-prefix':
    'El nombre de un grupo de seguridad no puede empezar con "sg-".',
  'issue.SG_NAME_DUPLICATE': 'Ya existe un grupo de seguridad llamado "{name}" en {vpcId}.',
  'issue.NACL_RULE_NUMBER_DUPLICATE':
    'El número de regla {ruleNumber} se usa dos veces en las reglas {direction}.',
  'issue.QUOTA_EXCEEDED.rules-per-security-group':
    'El grupo de seguridad tiene {count} reglas {direction}. La cuota por defecto es {limit}.',
  'issue.QUOTA_EXCEEDED.rules-per-network-acl':
    'La ACL de red tiene {count} reglas {direction}. La cuota por defecto es {limit}.',
  'issue.QUOTA_EXCEEDED.security-groups-per-network-interface':
    'La interfaz de red tiene {count} grupos de seguridad. La cuota por defecto es {limit}.',
  'issue.QUOTA_EXCEEDED.nat-gateways-per-az':
    '{availabilityZone} tiene {count} NAT gateways. La cuota por defecto es {limit} por zona de disponibilidad.',
  'issue.purpose.network': 'dirección de red',
  'issue.purpose.vpc-router': 'router de la VPC',
  'issue.purpose.dns': 'reservada por AWS (DNS)',
  'issue.purpose.future-use': 'reservada por AWS para uso futuro',
  'issue.purpose.broadcast': 'dirección de broadcast',
  'issue.field.name': 'nombre',
  'issue.field.description': 'descripción',
  'issue.direction.inbound': 'de entrada',
  'issue.direction.outbound': 'de salida',

  'sim.zoneNoPreference': '"No preference" elige la primera zona de disponibilidad de la región.',
  'sim.firstFreeAddress':
    'Si no eliges una dirección, el simulador toma la primera dirección utilizable libre de la subred.',
  'sim.publicPool':
    'Las IPv4 públicas simuladas salen de 203.0.113.0/24, un rango de documentación (RFC 5737).',
  'sim.subnetNoPreference': '"No preference" elige la primera subred de la VPC.',
  'sim.launchTime': 'El simulador no guarda la hora de lanzamiento.',
  'sim.instanceDefaults':
    'El simulador no modela la AMI, el tipo de instancia, los nombres DNS, las opciones de metadatos ni la reserva, así que esos campos muestran "–". Los ajustes que no modela muestran el valor por defecto de la consola para una instancia nueva.',
  'sim.dnsNotModeled': 'El simulador no modela los nombres DNS, así que estos campos muestran "–".',
  'sim.amiPlatform': 'El simulador solo modela la plataforma de la imagen: Linux/UNIX o Windows.',
  'sim.software.title': 'Software simulado',
  'sim.software.description':
    'En AWS el software viene de la AMI o de los user data. Al simulador solo le importa qué servicio escucha en qué puerto.',
  'sim.software.none': 'Ninguno',
  'sim.software.webServer': 'Servidor web (nginx en el puerto TCP 80)',
  'reason.NO_ROUTE_TO_DESTINATION': 'La tabla de rutas no tiene ruta hacia el destino.',
  'reason.BAD_STATE_ROUTE': 'La ruta que coincide es un blackhole: su destino no está disponible.',
  'reason.MORE_SPECIFIC_ROUTE':
    'Coincide una ruta más específica y gana, pero es un blackhole, así que el tráfico se descarta en vez de usar la ruta menos específica.',
  'reason.IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS':
    'El internet gateway descarta el tráfico de una interfaz sin dirección IPv4 pública.',
  'reason.IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS':
    'El internet gateway solo acepta tráfico hacia una IPv4 pública de una interfaz de la VPC.',
  'reason.IGW_DESTINATION_ADDRESS_NOT_IN_RFC1918_EGRESS':
    'El internet gateway descarta el tráfico hacia una dirección privada (RFC 1918).',
  'reason.IGW_DESTINATION_ADDRESS_NOT_IN_RFC6598_EGRESS':
    'El internet gateway descarta el tráfico hacia una dirección compartida (RFC 6598).',
  'reason.IGW_SOURCE_ADDRESS_NOT_IN_RFC1918_INGRESS':
    'El internet gateway descarta el tráfico desde una dirección privada (RFC 1918).',
  'reason.IGW_SOURCE_ADDRESS_NOT_IN_RFC6598_INGRESS':
    'El internet gateway descarta el tráfico desde una dirección compartida (RFC 6598).',
  'reason.SUBNET_ACL_RESTRICTION': 'Una regla de la ACL de red de la subred deniega el paquete.',
  'reason.ENI_SG_RULES_MISMATCH':
    'Ninguna regla de los grupos de seguridad de la interfaz de red permite el paquete.',
  'reason.SG_HAS_NO_RULES':
    'Los grupos de seguridad de la interfaz de red no tienen reglas en esta dirección.',
  'reason.NO_LISTENER': 'Nada en la instancia escucha en este puerto.',
  'reason.NO_INTERNET_GATEWAY': 'La VPC no tiene un internet gateway conectado.',
  'reason.UNSUPPORTED_FEATURE':
    'La ruta envía este paquete a un NAT gateway en un camino que el simulador no modela.',

  'query.UNKNOWN_REFERENCE': 'La consulta nombra una instancia que no existe.',
  'query.INVALID_QUERY': 'La consulta no es válida.',
  'query.IGW_EXPECTS_PUBLIC_ADDRESS': 'Una dirección de internet debe ser una IPv4 pública.',
  'query.DISCONNECTED_VPCS': 'En esta versión nada conecta estas VPC.',
  'query.UNSUPPORTED_FEATURE':
    'Llegar a una instancia por su dirección pública desde dentro de AWS no se simula.',

  'trace.blocked': 'La traza no puede ejecutarse',
  'trace.blockedHint': 'Corrige primero estos problemas:',
  'verdict.REACHED': 'Llegó',
  'verdict.BROKE_AT_HOP': 'Se rompió en un salto',
  'verdict.ROUTED_THEN_DROPPED': 'Enrutado y luego descartado',
  'trace.failedAt': '{direction}, salto {hop}',
  'direction.forward': 'Ida',
  'direction.return': 'Vuelta',
  'step.sg-egress': 'Grupo de seguridad (salida)',
  'step.nacl-outbound': 'ACL de red (salida)',
  'step.route-lookup': 'Consulta de la tabla de rutas',
  'step.igw-egress': 'Internet gateway (salida)',
  'step.igw-ingress': 'Internet gateway (entrada)',
  'step.nacl-inbound': 'ACL de red (entrada)',
  'step.sg-ingress': 'Grupo de seguridad (entrada)',
  'step.nat-gateway': 'NAT gateway',
  'step.host': 'Instancia',
  'outcome.pass': 'Pasó',
  'outcome.fail': 'Se detuvo aquí',
  'outcome.skipped': 'Omitido',
  'skipped.stateful-response': 'Respuesta a una petición permitida (con estado)',
  'skipped.same-subnet': 'Misma subred: las ACL de red no se revisan',

  'workbench.title': 'Workbench',
  'workbench.open': 'Abrir workbench',
  'workbench.close': 'Cerrar workbench',
  'workbench.tab.diagram': 'Diagrama',
  'workbench.tab.trace': 'Traza',
  'workbench.tab.browser': 'Navegador',
  'workbench.tab.yaml': 'YAML',

  'diagram.label': 'Diagrama de la topología',
  'diagram.empty': 'La topología todavía no tiene recursos.',
  'diagram.internet': 'Cliente de internet',
  'diagram.publicSubnet': 'Subred pública',
  'diagram.privateSubnet': 'Subred privada',
  'diagram.detached': 'Desconectado',
  'diagram.stoppedHere': 'Se detuvo aquí',
  'diagram.packet': 'Paquete en el salto {hop}',

  'trace.source': 'Origen',
  'trace.destination': 'Destino',
  'trace.port': 'Puerto de destino (TCP)',
  'trace.internetClient': 'Cliente de internet ({ip})',
  'trace.internetServer': 'Servidor de internet ({ip})',
  'trace.instancePublic': 'Dirección pública de {name}',
  'trace.instancePrivate': 'Dirección privada de {name}',
  'trace.run': 'Ejecutar traza',
  'trace.play': 'Reproducir',
  'trace.pause': 'Pausar',
  'trace.previous': 'Salto anterior',
  'trace.next': 'Salto siguiente',
  'trace.hops': 'Saltos',
  'trace.none': 'Elige un origen y un destino y ejecuta una traza.',
  'trace.col.index': '#',
  'trace.col.direction': 'Dirección',
  'trace.col.step': 'Paso',
  'trace.col.component': 'Componente',
  'trace.col.outcome': 'Resultado',
  'trace.col.reason': 'Motivo',
  'trace.portInvalid': 'Escribe un puerto de 1 a 65535.',

  'browser.address': 'Dirección',
  'browser.go': 'Ir',
  'browser.frameTitle': 'Página servida por {name}',
  'browser.cantReach': 'No se puede acceder a este sitio',
  'browser.cantReachHint': 'La conexión no se completó.',
  'browser.traceIt': 'Trazar esta petición',
  'browser.unknownHost':
    'El simulador solo conoce las direcciones de las instancias de esta topología.',
  'browser.badAddress': 'Escribe una dirección como http://203.0.113.25',
  'browser.emptyResponse': 'Conectado. El servicio no envió ninguna página.',
  'browser.hint': 'El navegador virtual es el cliente de internet {ip}.',

  'yaml.apply': 'Aplicar',
  'yaml.revert': 'Descartar cambios',
  'yaml.export': 'Exportar YAML',
  'yaml.import': 'Importar YAML',
  'yaml.applied': 'Aplicado a la topología.',
  'yaml.invalid': 'El YAML no se aplicó. Se mantiene la última topología válida.',
  'yaml.tooLarge': 'El YAML ocupa más de {limit} KiB.',
  'yaml.syntax': 'Error de YAML: {message}',
  'yaml.tag': 'No se permiten etiquetas como {tag}.',
  'yaml.alias': 'No se permiten anclas ni alias.',
  'yaml.schema': '{path}: {message}',
  'yaml.canonical': 'Algunos CIDR se guardaron en forma canónica, como hace AWS (ADR-05).',
  'yaml.editorLabel': 'YAML de la topología',

  'labs.title': 'Labs',
  'labs.description':
    'Escenarios para practicar. Cada lab arranca su propia topología; tu sandbox queda igual.',
  'labs.start': 'Empezar lab',
  'labs.resume': 'Continuar lab',
  'labs.restart': 'Reiniciar lab',
  'labs.status.notStarted': 'Sin empezar',
  'labs.status.inProgress': 'En curso',
  'labs.status.completed': 'Completado',
  'labs.open': 'Labs',
  'lab.panel': 'Lab',
  'lab.story': 'Escenario',
  'lab.goal': 'Objetivo',
  'lab.check': 'Comprobar',
  'lab.checkResult': 'Resultado de la comprobación',
  'lab.passed': 'Hecho',
  'lab.notYet': 'Todavía no',
  'lab.invalidTopology':
    'La topología tiene errores que AWS rechazaría. Mira el estado de la topología en Console Home.',
  'lab.complete': 'Lab completado',
  'lab.hint': 'Pista',
  'lab.hintN': 'Pista {n} de {total}',
  'lab.noMoreHints': 'No hay más pistas.',
  'lab.leave': 'Salir del lab',
  'lab.review': 'Repaso',
  'lab.hintsUsed': 'Pistas usadas',
  'lab.tracesRun': 'Trazas ejecutadas',
  'lab.wrongTurns': 'Páginas visitadas fuera del camino de la solución',
  'lab.noWrongTurns': 'Ninguna',
  'lab.mode': 'Modo lab: {title}',
};
